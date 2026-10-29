const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
class Jobs {
  constructor({ base, backend, ffmpeg, onEvent }) {
    Object.assign(this, { base, backend, ffmpeg, onEvent });
    this.children = new Map();
    this.active = null;
  }
  start(python, request, onComplete) {
    if (this.active) throw new Error('已有处理任务正在运行，请等待完成或先取消');
    const id = crypto.randomUUID();
    const jobDir = path.join(this.base, 'jobs', id);
    fs.mkdirSync(jobDir, { recursive: true });
    const file = path.join(jobDir, 'request.json');
    fs.writeFileSync(file, JSON.stringify(request));
    const child = spawn(python, ['-u', path.join(this.backend, 'worker.py'), file], {
      cwd: this.backend,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1',
        IMMERSE_FFMPEG: this.ffmpeg,
        TORCH_HOME: path.join(this.base, 'models'),
        HF_HOME: path.join(this.base, 'models', 'huggingface'),
        XDG_CACHE_HOME: path.join(this.base, 'cache'),
        NUMBA_CACHE_DIR: path.join(this.base, 'cache', 'numba'),
        TEMP: path.join(this.base, 'temp'),
        TMP: path.join(this.base, 'temp'),
        PATH: path.dirname(this.ffmpeg) + path.delimiter + process.env.PATH,
      },
    });
    this.active = id;
    this.children.set(id, child);
    let buffer = '',
      tail = '',
      failure = '',
      result = null,
      cancelled = false;
    const emit = (e) =>
      this.onEvent({ jobId: id, projectId: request.projectId, operation: request.operation, ...e });
    child.stdout.on('data', (b) => {
      buffer += b.toString();
      let n;
      while ((n = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, n);
        buffer = buffer.slice(n + 1);
        try {
          const event = JSON.parse(line);
          if (event.type === 'result') result = event.result;
          else if (event.type === 'failure') failure = event.message;
          else emit(event);
        } catch {
          tail = (tail + line + '\n').slice(-4000);
        }
      }
    });
    child.stderr.on('data', (b) => {
      tail = (tail + b.toString()).slice(-6000);
      fs.appendFileSync(path.join(jobDir, 'worker.log'), b);
    });
    child.on('error', (error) => emit({ type: 'error', message: error.message }));
    child.on('close', async (code) => {
      this.children.delete(id);
      if (this.active === id) this.active = null;
      cancelled = child._immerseCancelled;
      try {
        if (cancelled) emit({ type: 'cancelled', message: '任务已取消，原有数据已保留' });
        else if (code === 0 && result) {
          const committed = await onComplete(result);
          emit({ type: 'complete', result: committed });
        } else
          emit({
            type: 'error',
            message: failure || `本地处理未完成 (${code})，详细记录已保存在任务日志中。`,
          });
      } catch (e) {
        emit({ type: 'error', message: e.message });
      }
    });
    emit({ type: 'progress', message: '准备本地处理…', progress: 0 });
    return id;
  }
  cancel(id) {
    const child = this.children.get(id);
    if (child) {
      child._immerseCancelled = true;
      if (process.platform === 'win32')
        spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
      else child.kill();
    }
    return true;
  }
  close() {
    for (const id of this.children.keys()) this.cancel(id);
  }
}
module.exports = { Jobs };
