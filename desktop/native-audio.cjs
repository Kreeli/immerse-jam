const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const SYSTEMS = ['wasapi', 'wasapi-exclusive', 'wasapi-low-latency', 'directsound', 'asio'];
const RATES = [44100, 48000, 88200, 96000];
function validate(config) {
  if (
    !config ||
    !SYSTEMS.includes(config.backend) ||
    !RATES.includes(config.sampleRate) ||
    typeof config.deviceId !== 'string' ||
    !config.deviceId ||
    config.deviceId.length > 2048 ||
    config.deviceId.includes('\0')
  )
    throw new Error('音频系统、设备或采样率无效');
  return { backend: config.backend, deviceId: config.deviceId, sampleRate: config.sampleRate };
}
class NativeAudio {
  constructor({
    executable,
    assembly,
    emit = () => {},
    spawnProcess = spawn,
    exists = fs.existsSync,
    platform = process.platform,
  }) {
    this.executable = executable;
    this.assembly = assembly;
    this.emit = emit;
    this.spawn = spawnProcess;
    this.exists = exists;
    this.platform = platform;
    this.session = null;
    this.queue = Promise.resolve();
  }
  get available() {
    return (
      this.platform === 'win32' &&
      this.exists(this.executable) &&
      (!this.assembly || this.exists(this.assembly))
    );
  }
  async info() {
    if (!this.available)
      return {
        available: false,
        devices: [],
        errors: [],
        reason: '原生音频组件尚未构建或此平台不支持',
      };
    const result = await this.run(['--list']);
    return { ...result, available: true };
  }
  run(args) {
    return new Promise((resolve, reject) => {
      const child = this.spawn(this.executable, this.assembly ? [this.assembly, ...args] : args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '',
        error = '',
        settled = false;
      const finish = (problem, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (problem) reject(problem);
        else resolve(value);
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(new Error('原生音频组件响应超时'));
      }, 8000);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data) => {
        output += data;
        if (output.length > 131072) {
          child.kill();
          finish(new Error('原生音频组件返回数据过大'));
        }
      });
      child.stderr.on('data', (data) => {
        error = (error + data).slice(-4000);
      });
      child.once('error', (problem) => finish(problem));
      child.once('close', (code) => {
        try {
          const data = JSON.parse(output.trim());
          if (code !== 0 || data.type === 'error')
            throw new Error(data.message || error || '原生音频组件启动失败');
          finish(null, data);
        } catch (problem) {
          finish(problem);
        }
      });
    });
  }
  start(input) {
    const config = validate(input);
    const work = this.queue.then(async () => {
      if (!this.available) throw new Error('原生音频组件尚未构建或此平台不支持');
      await this.closeSession();
      const id = crypto.randomUUID();
      const child = this.spawn(
        this.executable,
        [
          ...(this.assembly ? [this.assembly] : []),
          '--play',
          Buffer.from(JSON.stringify(config)).toString('base64'),
        ],
        {
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );
      const session = { id, child, config, stopping: false, failure: '', lines: '' };
      this.session = session;
      const ready = await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) reject(error);
          else resolve(result);
        };
        const failed = (text) => {
          session.failure = text;
          if (!session.stopping && !session.notified) {
            session.notified = true;
            this.emit({ scope: 'native-audio', type: 'error', streamId: id, message: text });
          }
          finish(new Error(text));
        };
        const timer = setTimeout(() => {
          failed('原生音频组件响应超时');
          child.kill();
        }, 8000);
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (bytes) => {
          session.lines += bytes.toString('utf8');
          if (session.lines.length > 131072) {
            failed('原生音频组件返回数据过大');
            child.kill();
            return;
          }
          let line;
          while ((line = session.lines.indexOf('\n')) >= 0) {
            const text = session.lines.slice(0, line).trim();
            session.lines = session.lines.slice(line + 1);
            if (!text) continue;
            try {
              const value = JSON.parse(text);
              if (value.type === 'ready') finish(null, value);
              else if (value.type === 'error') failed(value.message || '原生音频输出中断');
            } catch {
              failed('原生音频组件返回数据无效');
              child.kill();
            }
          }
        });
        child.stderr.on('data', (data) => {
          session.failure = (session.failure + data).slice(-4000);
        });
        child.stdin.on('error', (error) => {
          if (!session.stopping) failed(error.message);
        });
        child.once('error', (error) => failed(error.message));
        child.once('close', () => {
          if (!session.stopping) failed(session.failure || '原生音频输出已断开');
        });
      }).catch(async (error) => {
        await this.closeSession(id);
        throw error;
      });
      this.lastConfig = config;
      return { ...ready, streamId: id };
    });
    this.queue = work.catch(() => {});
    return work;
  }
  async write({ streamId, samples } = {}) {
    const session = this.session;
    if (!session || session.id !== streamId || session.stopping)
      return { accepted: false, stale: true };
    let bytes;
    if (samples instanceof ArrayBuffer) bytes = Buffer.from(samples);
    else if (ArrayBuffer.isView(samples))
      bytes = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
    else throw new Error('无效音频数据');
    if (!bytes.length || bytes.length > 32768 || bytes.length % 8)
      throw new Error('无效音频数据长度');
    for (let offset = 0; offset < bytes.length; offset += 4) {
      const value = bytes.readFloatLE(offset);
      if (!Number.isFinite(value) || Math.abs(value) > 1.01) throw new Error('无效音频采样');
    }
    if (session.child.stdin.writableLength > (session.config.sampleRate * 8) / 4)
      throw new Error('音频输出积压，请增大缓冲或改用兼容模式');
    if (!session.child.stdin.write(bytes))
      await new Promise((resolve, reject) => {
        const stream = session.child.stdin;
        const done = (error) => {
          clearTimeout(timer);
          stream.off('drain', drained);
          stream.off('error', done);
          stream.off('close', closed);
          if (error) reject(error);
          else resolve();
        };
        const drained = () => done(),
          closed = () => done(new Error('原生音频输出已断开'));
        const timer = setTimeout(
          () => done(new Error('音频输出积压，请增大缓冲或改用兼容模式')),
          2000,
        );
        stream.once('drain', drained);
        stream.once('error', done);
        stream.once('close', closed);
      });
    return { accepted: true };
  }
  stop(id) {
    const work = this.queue.then(() => this.closeSession(id));
    this.queue = work.catch(() => {});
    return work;
  }
  async closeSession(id) {
    const session = this.session;
    if (!session || (id && id !== session.id)) return;
    this.session = null;
    session.stopping = true;
    const child = session.child;
    if (child.exitCode !== null && child.exitCode !== undefined) return;
    await new Promise((resolve) => {
      let timer;
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      child.once('close', done);
      child.stdin.end();
      timer = setTimeout(() => {
        child.kill();
        done();
      }, 1000);
    });
  }
}
function hostCommand(root, packaged, resources) {
  let base = path.join(resources || root, 'native-audio');
  if (!packaged) {
    const parent = path.join(root, '.runtime', 'native-audio');
    let revision = 'unbuilt';
    try {
      revision = JSON.parse(fs.readFileSync(path.join(parent, 'current.json'), 'utf8')).revision;
    } catch {}
    if (!/^[a-f0-9]{20}$/.test(revision)) revision = 'unbuilt';
    base = path.join(parent, 'versions', revision);
  }
  return {
    executable: path.join(base, 'dotnet.exe'),
    assembly: path.join(base, 'ImmerseAudioHost.dll'),
  };
}
module.exports = { NativeAudio, validate, hostCommand, SYSTEMS, RATES };
