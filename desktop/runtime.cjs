const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const UV = {
  url: 'https://files.pythonhosted.org/packages/7c/9d/714523188aea3054644d8e69ae8089aac70325a3cee2d3d05509d4f23398/uv-0.13.6-py3-none-win_amd64.whl',
  sha256: '7c9bc35ccb65932d8dc10a0669f9c805eaa3c9827ce18ecbecb1bd67944b2cdf',
};
function run(exe, args, env, onEvent) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env, ...env },
      cwd: path.dirname(exe),
    });
    let tail = '';
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (b) => {
        const message = b;
        tail = (tail + message).slice(-6000);
        onEvent?.({ type: 'progress', message: message.trim() });
      });
    }
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`安装步骤未完成 (${code})：${tail}`)),
    );
  });
}
async function download(url, dest, sha256, onEvent) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + '.part';
  if (fs.existsSync(dest)) {
    if (!sha256) return dest;
    const current = crypto.createHash('sha256');
    for await (const b of fs.createReadStream(dest)) current.update(b);
    if (current.digest('hex') === sha256) return dest;
  }
  const existing = fs.existsSync(part) ? fs.statSync(part).size : 0;
  const response = await fetch(url, {
    headers: existing ? { Range: `bytes=${existing}-` } : {},
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (response.status === 416 && existing) {
    const hash = crypto.createHash('sha256');
    for await (const b of fs.createReadStream(part)) hash.update(b);
    if (sha256 && hash.digest('hex') === sha256) {
      fs.renameSync(part, dest);
      return dest;
    }
    fs.unlinkSync(part);
    return download(url, dest, sha256, onEvent);
  }
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  const resume = response.status === 206 && existing > 0;
  const hash = crypto.createHash('sha256');
  if (resume) for await (const b of fs.createReadStream(part)) hash.update(b);
  const fd = fs.openSync(part, resume ? 'a' : 'w');
  let size = resume ? existing : 0,
    last = 0;
  const total = Number(response.headers.get('content-length')) + (resume ? existing : 0);
  try {
    for await (const chunk of response.body) {
      fs.writeSync(fd, chunk);
      hash.update(chunk);
      size += chunk.length;
      if (Date.now() - last > 700) {
        onEvent?.({
          type: 'progress',
          message: `正在下载 ${Math.round(size / 1048576)} MB${total ? ' / ' + Math.round(total / 1048576) + ' MB' : ''}`,
          progress: total ? size / total : undefined,
        });
        last = Date.now();
      }
    }
  } finally {
    fs.closeSync(fd);
  }
  if (sha256 && hash.digest('hex') !== sha256) {
    fs.unlinkSync(part);
    throw new Error('下载文件校验失败，请重试');
  }
  fs.renameSync(part, dest);
  return dest;
}
async function ensureUv(base, onEvent) {
  const bundled = path.join(process.resourcesPath || root, 'vendor', 'uv.exe');
  if (fs.existsSync(bundled)) return bundled;
  const exe = path.join(base, 'tools', 'uv.exe');
  if (fs.existsSync(exe)) return exe;
  const wheel = await download(UV.url, path.join(base, 'tools', 'uv.whl'), UV.sha256, onEvent);
  const Zip = require('adm-zip');
  const zip = new Zip(wheel);
  const entry = zip.getEntries().find((e) => e.entryName.endsWith('/uv.exe'));
  if (!entry) throw new Error('环境安装器不完整');
  fs.writeFileSync(exe, entry.getData());
  return exe;
}
async function ensureRuntime(base, mode = 'cpu', onEvent = () => {}) {
  const python = path.join(base, 'venv', 'Scripts', 'python.exe'),
    marker = path.join(base, 'ready.json');
  if (fs.existsSync(marker) && fs.existsSync(python)) {
    const state = JSON.parse(fs.readFileSync(marker));
    if (state.recipe === 2 && state.mode === mode) return python;
  }
  fs.mkdirSync(base, { recursive: true });
  const temp = path.join(base, 'temp');
  fs.mkdirSync(temp, { recursive: true });
  const uv = await ensureUv(base, onEvent);
  const env = {
    UV_PYTHON_INSTALL_DIR: path.join(base, 'python'),
    UV_CACHE_DIR: path.join(base, 'cache'),
    UV_TOOL_DIR: path.join(base, 'uv-tools'),
    UV_TOOL_BIN_DIR: path.join(base, 'bin'),
    HF_HOME: path.join(base, 'cache', 'huggingface'),
    TORCH_HOME: path.join(base, 'cache', 'torch'),
    XDG_CACHE_HOME: path.join(base, 'cache'),
    PIP_CACHE_DIR: path.join(base, 'cache', 'pip'),
    PYTHONUSERBASE: path.join(base, 'python-user'),
    PYTHONUTF8: '1',
    UV_HTTP_TIMEOUT: '180',
    UV_CONCURRENT_DOWNLOADS: '4',
    UV_LINK_MODE: 'copy',
    TEMP: temp,
    TMP: temp,
  };
  if (!fs.existsSync(python)) {
    onEvent({ message: '正在准备应用专用 Python 环境' });
    const managed = path.join(base, 'python', 'cpython-3.11.18-windows-x86_64-none', 'python.exe');
    if (!fs.existsSync(managed)) {
      try {
        await run(uv, ['python', 'install', '3.11.18', '--no-bin', '--no-registry'], env, onEvent);
      } catch (error) {
        if (!fs.existsSync(managed)) throw error;
      }
    }
    await run(
      uv,
      ['venv', '--python', managed, '--no-python-downloads', path.join(base, 'venv')],
      env,
      onEvent,
    );
  }
  onEvent({ message: mode === 'cuda' ? '正在安装 NVIDIA 加速运行库' : '正在安装通用运行库' });
  await run(
    uv,
    [
      'pip',
      'install',
      '--python',
      python,
      'torch==2.8.0',
      'torchaudio==2.8.0',
      'torchvision==0.23.0',
      '--index-url',
      mode === 'cuda'
        ? 'https://download.pytorch.org/whl/cu126'
        : 'https://download.pytorch.org/whl/cpu',
    ],
    env,
    onEvent,
  );
  const backend = fs.existsSync(path.join(root, 'backend'))
    ? path.join(root, 'backend')
    : path.join(process.resourcesPath, 'backend');
  await run(
    uv,
    [
      'pip',
      'install',
      '--python',
      python,
      '-r',
      path.join(backend, 'requirements.txt'),
      '--constraint',
      path.join(backend, 'constraints.txt'),
      '--override',
      path.join(backend, 'overrides.txt'),
    ],
    env,
    onEvent,
  );
  await run(
    python,
    [
      '-c',
      'import torch,librosa,soundfile,pretty_midi; from audio_separator.separator import Separator; print("环境验证完成", torch.cuda.is_available())',
    ],
    env,
    onEvent,
  );
  fs.writeFileSync(
    marker,
    JSON.stringify({ recipe: 2, mode, createdAt: new Date().toISOString() }),
  );
  onEvent({ type: 'ready', message: '本地环境已就绪' });
  return python;
}
module.exports = { ensureRuntime, ensureUv, download };
async function downloadModel(url, dest, sha256, onEvent) {
  if (fs.existsSync(dest)) return download(url, dest, sha256, onEvent);
  let probe;
  try {
    probe = await fetch(url, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    return download(url, dest, sha256, onEvent);
  }
  const total = Number(probe.headers.get('content-range')?.split('/')[1]);
  await probe.body?.cancel();
  if (probe.status !== 206 || !Number.isSafeInteger(total) || total < 16 * 1048576)
    return download(url, dest, sha256, onEvent);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const stateFile = dest + '.ranges.json',
    target = dest + '.parallel',
    part = dest + '.part';
  let state;
  if (fs.existsSync(stateFile) && fs.existsSync(target)) {
    state = JSON.parse(fs.readFileSync(stateFile));
    if (state.url !== url || state.total !== total) state = null;
  }
  if (!state) {
    const existing =
      fs.existsSync(part) && fs.statSync(part).size < total ? fs.statSync(part).size : 0;
    if (existing) fs.copyFileSync(part, target);
    else fs.writeFileSync(target, '');
    const chunk = Math.ceil((total - existing) / 8);
    state = {
      url,
      total,
      existing,
      ranges: Array.from({ length: 8 }, (_, i) => ({
        start: existing + i * chunk,
        end: Math.min(total - 1, existing + (i + 1) * chunk - 1),
        received: 0,
      })),
    };
    fs.writeFileSync(stateFile, JSON.stringify(state));
  }
  const fd = fs.openSync(target, 'r+');
  let last = 0;
  try {
    const results = await Promise.allSettled(
      state.ranges.map(async (range) => {
        if (range.start + range.received > range.end) return;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const start = range.start + range.received,
              r = await fetch(url, {
                headers: { Range: `bytes=${start}-${range.end}` },
                signal: AbortSignal.timeout(30 * 60 * 1000),
              });
            if (r.status !== 206 || !r.headers.get('content-range')?.startsWith(`bytes ${start}-`))
              throw new Error('下载服务器未正确返回分块');
            for await (const chunk of r.body) {
              if (range.start + range.received + chunk.length > range.end + 1)
                throw new Error('下载分块大小错误');
              fs.writeSync(fd, chunk, 0, chunk.length, range.start + range.received);
              range.received += chunk.length;
              if (Date.now() - last > 1000) {
                last = Date.now();
                fs.writeFileSync(stateFile, JSON.stringify(state));
                const size = state.existing + state.ranges.reduce((n, r) => n + r.received, 0);
                onEvent?.({
                  type: 'progress',
                  message: `正在下载 ${Math.round(size / 1048576)} MB / ${Math.round(total / 1048576)} MB`,
                  progress: size / total,
                });
              }
            }
            if (range.start + range.received !== range.end + 1) throw new Error('下载分块不完整');
            fs.writeFileSync(stateFile, JSON.stringify(state));
            return;
          } catch (error) {
            if (attempt === 3) throw error;
            await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
          }
        }
      }),
    );
    const failed = results.find((r) => r.status === 'rejected');
    if (failed) throw failed.reason;
  } finally {
    fs.closeSync(fd);
  }
  if (fs.statSync(target).size !== total) throw new Error('下载文件大小错误');
  if (sha256) {
    const hash = crypto.createHash('sha256');
    for await (const b of fs.createReadStream(target)) hash.update(b);
    if (hash.digest('hex') !== sha256) {
      fs.unlinkSync(target);
      fs.unlinkSync(stateFile);
      if (fs.existsSync(part)) fs.unlinkSync(part);
      throw new Error('模型校验失败，请重新下载');
    }
  }
  fs.renameSync(target, dest);
  fs.unlinkSync(stateFile);
  if (fs.existsSync(part)) fs.unlinkSync(part);
  return dest;
}
module.exports.downloadModel = downloadModel;
