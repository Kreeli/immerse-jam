const fs = require('node:fs'),
  path = require('node:path');
const { manifest, copyVerified, hash } = require('../desktop/installer-assets.cjs');
const root = path.resolve(__dirname, '..');
async function prepare() {
  const runtime = path.join(root, '.runtime'),
    target = path.join(root, 'release/installer-payload');
  fs.mkdirSync(target, { recursive: true });
  // Packaging is deliberately cache-only: do not start large downloads as a
  // side effect of building the application.
  for (const id of ['uv', 'beat-this', 'python-bootstrap', 'ffmpeg']) {
    const item = manifest.assets.find((item) => item.id === id);
    const source = path.join(runtime, item.cached);
    if (!fs.existsSync(source)) throw new Error('打包需要本地已缓存的资源：' + source);
    await copyVerified(source, path.join(target, item.file), item.sha256);
    console.log('Bundled verified local asset: ' + item.file);
  }
  const licenses = path.join(target, 'licenses');
  fs.mkdirSync(licenses, { recursive: true });
  for (const name of ['LICENSE', 'README'])
    fs.copyFileSync(
      path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe.' + name),
      path.join(licenses, 'ffmpeg.exe.' + name),
    );
  fs.copyFileSync(
    path.join(root, 'backend/vendor/beat_this/LICENSE'),
    path.join(licenses, 'BeatThis-MIT.txt'),
  );
  const pythonAsset = manifest.assets.find((item) => item.id === 'python-bootstrap');
  const pythonLicense = require('node:child_process').execFileSync(
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),
    ['-xOf', path.join(target, pythonAsset.file), 'python/LICENSE.txt'],
    { windowsHide: true },
  );
  fs.writeFileSync(path.join(licenses, 'Python-3.11.18-LICENSE.txt'), pythonLicense);
  const wheelFile = path.join(runtime, 'tools/uv.whl');
  if ((await hash(wheelFile)) !== manifest.assets.find((item) => item.id === 'uv-wheel').sha256)
    throw new Error('uv wheel 校验失败，不能使用其中的授权文件');
  const wheel = new (require('adm-zip'))(wheelFile);
  for (const name of ['LICENSE-MIT', 'LICENSE-APACHE']) {
    const entry = wheel.getEntries().find((entry) => entry.entryName.endsWith('/' + name));
    if (!entry) throw new Error('uv 资源缺少授权文件：' + name);
    fs.writeFileSync(path.join(licenses, 'uv-' + name + '.txt'), entry.getData());
  }
  fs.writeFileSync(path.join(target, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
prepare().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
