const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { atomicJson } = require('./store.cjs');
const { fetch: fetchNetwork, chunks, downloadError, proxyEnv } = require('./network.cjs');
function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}
const root = path.resolve(__dirname, '..');
const UV = {
  url: 'https://files.pythonhosted.org/packages/7c/9d/714523188aea3054644d8e69ae8089aac70325a3cee2d3d05509d4f23398/uv-0.13.6-py3-none-win_amd64.whl',
  sha256: '7c9bc35ccb65932d8dc10a0669f9c805eaa3c9827ce18ecbecb1bd67944b2cdf',
};
function activity(directories) {
  let size = 0,
    latest = 0,
    count = 0;
  const pending = [...directories];
  while (pending.length && count < 20000) {
    const folder = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++count > 20000) break;
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile()) {
        try {
          const stat = fs.statSync(file);
          size += stat.size;
          latest = Math.max(latest, stat.mtimeMs);
        } catch {}
      }
    }
  }
  return `${count}:${size}:${latest}`;
}
function run(exe, args, env, onEvent, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      windowsHide: true,
      env: { ...process.env, ...env },
      cwd: path.dirname(exe),
    });
    let tail = '',
      activeAt = Date.now(),
      stalled = false;
    let signature = activity(options.watchDirs || []);
    const watcher = options.stallMs
      ? setInterval(
          () => {
            const next = activity(options.watchDirs || []);
            if (next !== signature) {
              signature = next;
              activeAt = Date.now();
            }
            if (Date.now() - activeAt > options.stallMs) {
              stalled = true;
              child.kill();
            }
          },
          Math.min(5000, options.stallMs / 2),
        )
      : undefined;
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', (b) => {
        const message = b;
        activeAt = Date.now();
        tail = (tail + message).slice(-6000);
        onEvent?.({ type: 'progress', message: message.trim() });
      });
    }
    child.on('error', (error) => {
      clearInterval(watcher);
      reject(error);
    });
    child.on('close', (code) => {
      clearInterval(watcher);
      if (stalled) reject(new Error('下载连续两分钟没有进展，正在尝试备用源。'));
      else if (code === 0) resolve();
      else reject(new Error(`安装步骤未完成 (${code})：${tail}`));
    });
  });
}
function downloadProgress(dest, total, initial, onEvent) {
  const began = Date.now();
  let last = 0;
  return (size, phase = 'download', force = false) => {
    const now = Date.now();
    if (!force && now - last < 500) return;
    last = now;
    onEvent?.({
      type: 'progress',
      file: path.basename(dest),
      phase,
      received: size,
      total: total || undefined,
      bytesPerSecond:
        phase === 'download'
          ? Math.max(0, ((size - initial) * 1000) / Math.max(1, now - began))
          : undefined,
      progress: phase === 'verify' ? undefined : total ? Math.min(1, size / total) : undefined,
      message:
        phase === 'verify'
          ? '正在校验下载文件…'
          : `正在下载 ${Math.round(size / 1048576)} MB${total ? ' / ' + Math.round(total / 1048576) + ' MB' : ''}`,
    });
  };
}
async function download(...args) {
  try {
    return await downloadFile(...args);
  } catch (error) {
    throw downloadError(error);
  }
}
async function downloadFile(url, dest, sha256, onEvent) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const part = dest + '.part';
  if (fs.existsSync(dest)) {
    if (!sha256) return dest;
    downloadProgress(
      dest,
      fs.statSync(dest).size,
      0,
      onEvent,
    )(fs.statSync(dest).size, 'verify', true);
    const current = crypto.createHash('sha256');
    for await (const b of fs.createReadStream(dest)) current.update(b);
    if (current.digest('hex') === sha256) return dest;
  }
  const existing = fs.existsSync(part) ? fs.statSync(part).size : 0;
  const response = await fetchNetwork(url, {
    headers: existing ? { Range: `bytes=${existing}-` } : {},
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
  let size = resume ? existing : 0;
  const total = Number(response.headers.get('content-length')) + (resume ? existing : 0);
  const report = downloadProgress(dest, total, size, onEvent);
  report(size, 'download', true);
  try {
    for await (const chunk of chunks(response)) {
      fs.writeSync(fd, chunk);
      hash.update(chunk);
      size += chunk.length;
      report(size);
    }
  } finally {
    fs.closeSync(fd);
  }
  report(size, 'verify', true);
  if (sha256 && hash.digest('hex') !== sha256) {
    fs.unlinkSync(part);
    throw new Error('下载文件校验失败，请重试');
  }
  fs.renameSync(part, dest);
  report(size, 'complete', true);
  return dest;
}
async function ensureUv(base, onEvent) {
  const assets = require('./installer-assets.cjs');
  const exe = path.join(base, 'tools', 'uv.exe');
  if (fs.existsSync(exe)) return exe;
  const pinned = assets.manifest.assets.find((item) => item.id === 'uv');
  if (await assets.copyBundled(pinned.file, exe, pinned.sha256, onEvent)) return exe;
  const wheel = await downloadSources(
    assets.mirrorUrls(UV.sha256, UV.url),
    path.join(base, 'tools', 'uv.whl'),
    UV.sha256,
    onEvent,
  );
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
    const state = readState(marker);
    if (
      state?.recipe === 3 &&
      state.mode === mode &&
      (await require('./runtime-health.cjs').healthy(python))
    )
      return python;
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
    UV_HTTP_TIMEOUT: '45',
    UV_HTTP_CONNECT_TIMEOUT: '20',
    UV_HTTP_RETRIES: '1',
    UV_SYSTEM_CERTS: 'true',
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
        await run(
          uv,
          ['python', 'install', '3.11.18', '--no-bin', '--no-registry'],
          { ...env, ...(await proxyEnv('https://github.com')) },
          onEvent,
        );
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
  const sources = require('./package-index.cjs');
  const preference = readState(path.join(base, 'downloads.json'))?.source || 'auto';
  await sources.installTorch(
    uv,
    [
      'pip',
      'install',
      '--python',
      python,
      'torch==2.8.0',
      'torchaudio==2.8.0',
      'torchvision==0.23.0',
    ],
    env,
    onEvent,
    run,
    mode,
    preference,
  );
  const backend = fs.existsSync(path.join(root, 'backend'))
    ? path.join(root, 'backend')
    : path.join(process.resourcesPath, 'backend');
  const site = path.join(base, 'venv', 'Lib', 'site-packages');
  if (fs.readdirSync(site).some((entry) => /^onnx_weekly-.+\.dist-info$/.test(entry)))
    await run(uv, ['pip', 'uninstall', '--python', python, 'onnx-weekly'], env, onEvent);
  await require('./package-index.cjs').installPackages(
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
      '--excludes',
      path.join(backend, 'excludes.txt'),
      '--reinstall-package',
      'onnx',
    ],
    env,
    onEvent,
    run,
    undefined,
    preference,
  );
  onEvent({ type: 'progress', message: '正在检查环境…' });
  if (!(await require('./runtime-health.cjs').healthy(python, true)))
    throw new Error('本地环境验证失败，请重试安装');
  atomicJson(marker, { recipe: 3, mode, createdAt: new Date().toISOString() });
  onEvent({ type: 'ready', message: '本地环境已就绪' });
  return python;
}
module.exports = { ensureRuntime, ensureUv, download, run };
async function downloadModel(url, dest, sha256, onEvent) {
  if (fs.existsSync(dest)) return download(url, dest, sha256, onEvent);
  let probe;
  try {
    probe = await fetchNetwork(url, {
      headers: { Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw downloadError(error);
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
    state = readState(stateFile);
    if (!validRanges(state, url, total, fs.statSync(target).size, sha256)) state = null;
  }
  if (!state) {
    const existing =
      fs.existsSync(part) && fs.statSync(part).size < total ? fs.statSync(part).size : 0;
    if (existing) fs.copyFileSync(part, target);
    else fs.writeFileSync(target, '');
    const chunk = Math.ceil((total - existing) / 8);
    state = {
      url,
      sha256,
      total,
      existing,
      ranges: Array.from({ length: 8 }, (_, i) => ({
        start: existing + i * chunk,
        end: Math.min(total - 1, existing + (i + 1) * chunk - 1),
        received: 0,
      })),
    };
    atomicJson(stateFile, state);
  }
  state.url = url;
  atomicJson(stateFile, state);
  const fd = fs.openSync(target, 'r+');
  const received = () => state.existing + state.ranges.reduce((n, r) => n + r.received, 0);
  const report = downloadProgress(dest, total, received(), onEvent);
  report(received(), 'download', true);
  let last = 0;
  try {
    const results = await Promise.allSettled(
      state.ranges.map(async (range) => {
        if (range.start + range.received > range.end) return;
        let failures = 0;
        for (;;) {
          const before = range.received;
          try {
            const start = range.start + range.received,
              r = await fetchNetwork(url, {
                headers: { Range: `bytes=${start}-${range.end}` },
              });
            if (r.status !== 206 || !r.headers.get('content-range')?.startsWith(`bytes ${start}-`))
              throw new Error('下载服务器未正确返回分块');
            for await (const chunk of chunks(r)) {
              if (range.start + range.received + chunk.length > range.end + 1)
                throw new Error('下载分块大小错误');
              fs.writeSync(fd, chunk, 0, chunk.length, range.start + range.received);
              range.received += chunk.length;
              report(received());
              if (Date.now() - last > 1000) {
                last = Date.now();
                atomicJson(stateFile, state);
              }
            }
            if (range.start + range.received !== range.end + 1) throw new Error('下载分块不完整');
            atomicJson(stateFile, state);
            return;
          } catch (error) {
            atomicJson(stateFile, state);
            if (range.start + range.received === range.end + 1) return;
            failures = range.received > before ? 0 : failures + 1;
            if (failures >= 3) throw error;
            onEvent?.({
              type: 'progress',
              message: '连接中断，正在从断点继续下载…',
              file: path.basename(dest),
              received: received(),
              total,
            });
            await new Promise((r) => setTimeout(r, 500 * (failures + 1)));
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
  report(total, 'verify', true);
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
  report(total, 'complete', true);
  return dest;
}
module.exports.downloadModel = downloadModel;
async function downloadSources(urls, dest, sha256, onEvent) {
  let last;
  for (const [index, url] of [...new Set(urls)].entries()) {
    if (index) onEvent?.({ type: 'progress', message: '下载源暂不可用，正在切换备用源…' });
    try {
      return await downloadModel(url, dest, sha256, onEvent);
    } catch (error) {
      last = error;
    }
  }
  throw downloadError(last || new Error('没有可用的下载源'));
}
module.exports.downloadSources = downloadSources;
function validRanges(state, url, total, size, sha256) {
  if (
    !state ||
    (state.url !== url && (!sha256 || state.sha256 !== sha256)) ||
    state.total !== total ||
    !Number.isSafeInteger(state.existing) ||
    state.existing < 0 ||
    state.existing >= total ||
    size < state.existing ||
    size > total ||
    !Array.isArray(state.ranges) ||
    state.ranges.length !== 8
  )
    return false;
  const chunk = Math.ceil((total - state.existing) / 8);
  return state.ranges.every(
    (r, i) =>
      r &&
      [r.start, r.end, r.received].every(Number.isSafeInteger) &&
      r.start === state.existing + i * chunk &&
      r.end === Math.min(total - 1, state.existing + (i + 1) * chunk - 1) &&
      r.received >= 0 &&
      r.received <= Math.max(0, r.end - r.start + 1) &&
      (!r.received || size >= r.start + r.received),
  );
}
module.exports.validRanges = validRanges;
