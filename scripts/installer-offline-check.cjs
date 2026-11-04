// Explicit developer check: uses bundled components in an isolated workspace.
// No dependency/model downloads, registry writes, or private library access.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { ensurePython } = require('../desktop/python-runtime.cjs');
const { run } = require('../desktop/runtime.cjs');
const { Models } = require('../desktop/models.cjs');
const { hash, manifest } = require('../desktop/installer-assets.cjs');
async function main() {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'bootstrap-offline-'));
  process.env.IMMERSE_COMPONENTS_DIR = path.resolve(process.argv[2] || 'release/installer-payload');
  globalThis.fetch = async () => {
    throw new Error('Offline check attempted network');
  };
  const events = [],
    env = {
      PYTHONUTF8: '1',
      UV_CACHE_DIR: path.join(root, 'cache'),
      UV_PYTHON_INSTALL_DIR: path.join(root, 'python'),
      TEMP: path.join(root, 'temp'),
      TMP: path.join(root, 'temp'),
    };
  fs.mkdirSync(env.TEMP, { recursive: true });
  const python = await ensurePython(
    root,
    env,
    (event) => events.push(event),
    run,
    async () => {
      throw new Error('Bootstrap attempted a download');
    },
  );
  await run(
    python,
    ['-I', '-c', 'import ssl,sqlite3,venv; print("offline Python ready")'],
    env,
    console.log,
  );
  await run(
    path.resolve('.runtime/tools/uv.exe'),
    ['venv', '--python', python, '--no-python-downloads', path.join(root, 'venv')],
    env,
    console.log,
  );
  const models = new Models(root);
  const audio = await require('../desktop/audio-tools.cjs').ensureAudioTools(root, (event) =>
    events.push(event),
  );
  assert.equal(await hash(audio), require('../desktop/audio-tools.cjs').TOOL.sha256);
  const first = await models.ensure('beat-this', (event) => events.push(event));
  const file = path.join(first.directory, first.file);
  assert.equal(await hash(file), manifest.assets.find((asset) => asset.id === 'beat-this').sha256);
  fs.writeFileSync(file, 'damaged existing checkpoint');
  await models.ensure('beat-this', (event) => events.push(event));
  assert.equal(await hash(file), first.sha256);
  assert.ok(events.some((event) => event.message?.includes('本地安装资源')));
  fs.writeFileSync(
    path.join(root, 'result.json'),
    JSON.stringify({ python, beatThisBytes: fs.statSync(file).size, networkRequests: 0 }, null, 2),
  );
  console.log(
    JSON.stringify({
      root,
      python: '3.11.18',
      beatThisBytes: fs.statSync(file).size,
      networkRequests: 0,
      damagedModelRestored: true,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
