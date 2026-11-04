const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const assets = require('./installer-assets.cjs');
const VERSION = '3.11.18';
async function ensurePython(base, env, onEvent, run, downloadSources) {
  const root = path.join(base, 'python'),
    target = path.join(root, `cpython-${VERSION}-windows-x86_64-none`),
    python = path.join(target, 'python.exe');
  const check = (exe) =>
    run(
      exe,
      ['-I', '-c', `import sys,ssl,venv; assert sys.version_info[:3] == (3,11,18)`],
      env,
      () => {},
      { stallMs: 30000 },
    );
  if (fs.existsSync(python)) {
    try {
      await check(python);
      return python;
    } catch {}
  }
  const item = assets.manifest.assets.find((asset) => asset.id === 'python-bootstrap'),
    archive = path.join(base, 'downloads', item.file);
  onEvent({ type: 'progress', message: '正在准备内置 Python 基础环境…' });
  if (!(await assets.copyBundled(item.file, archive, item.sha256, onEvent)))
    await downloadSources(assets.mirrorUrls(item.sha256, item.url), archive, item.sha256, onEvent);
  fs.mkdirSync(root, { recursive: true });
  const staging = path.join(root, '.prepare-' + crypto.randomUUID()),
    previous = path.join(root, '.previous-' + crypto.randomUUID());
  fs.mkdirSync(staging);
  let moved = false;
  try {
    onEvent({ type: 'progress', message: '正在解压并校验 Python 基础环境…' });
    await run(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),
      ['-xzf', archive, '-C', staging],
      env,
      onEvent,
      { stallMs: 120000, watchDirs: [staging] },
    );
    await check(path.join(staging, 'python', 'python.exe'));
    if (fs.existsSync(target)) {
      fs.renameSync(target, previous);
      moved = true;
    }
    try {
      fs.renameSync(path.join(staging, 'python'), target);
    } catch (error) {
      if (moved) fs.renameSync(previous, target);
      throw error;
    }
    return python;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
    // Keep a replaced damaged environment for recovery; do not remove existing data.
  }
}
module.exports = { ensurePython };
