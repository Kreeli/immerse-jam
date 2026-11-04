// Exercise the real uv two-stage install with tiny local stand-in wheels.
// No network, user environment or real multi-GB runtime is touched.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const Zip = require('adm-zip');
const { run } = require('../desktop/runtime.cjs');
const { installTorch } = require('../desktop/package-index.cjs');
async function main() {
  fs.mkdirSync(path.resolve('.runtime/test-workspaces'), { recursive: true });
  const area = fs.mkdtempSync(
    path.join(path.resolve('.runtime/test-workspaces'), 'torch-pipeline-'),
  );
  const env = {
    UV_CACHE_DIR: path.join(area, 'cache'),
    TEMP: path.join(area, 'temp'),
    TMP: path.join(area, 'temp'),
    UV_LINK_MODE: 'copy',
  };
  fs.mkdirSync(env.TEMP);
  const uv = path.resolve('.runtime/tools/uv.exe');
  const managed = path.resolve('.runtime/python/cpython-3.11.18-windows-x86_64-none/python.exe');
  const python = path.join(area, 'venv/Scripts/python.exe');
  await run(
    uv,
    ['venv', '--python', managed, '--no-python-downloads', path.join(area, 'venv')],
    env,
  );
  function wheel(file, name, version, deps = []) {
    const zip = new Zip(),
      meta = `${name}-${version}.dist-info/`;
    zip.addFile(`${name}/__init__.py`, Buffer.from(`__version__ = '${version}'\n`));
    zip.addFile(
      meta + 'METADATA',
      Buffer.from(
        `Metadata-Version: 2.1\nName: ${name}\nVersion: ${version}\n${deps.map((dep) => 'Requires-Dist: ' + dep + '\n').join('')}\n`,
      ),
    );
    zip.addFile(
      meta + 'WHEEL',
      Buffer.from(
        'Wheel-Version: 1.0\nGenerator: immerse-test\nRoot-Is-Purelib: true\nTag: cp311-cp311-win_amd64\n',
      ),
    );
    zip.addFile(meta + 'RECORD', Buffer.alloc(0));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    zip.writeZip(file);
  }
  const args = [
    'pip',
    'install',
    '--python',
    python,
    'torch==2.8.0',
    'torchaudio==2.8.0',
    'torchvision==0.23.0',
  ];
  const services = {
    fetchIndex: async () => {
      throw new Error('offline fixture');
    },
    download: async (_url, dest) => {
      const [name, version] = path.basename(dest).split('-');
      wheel(dest, name, version, name === 'torch' ? ['numpy==2.3.5'] : ['torch==2.8.0']);
    },
  };
  await installTorch(uv, args, env, () => {}, run, 'cuda', 'official', services);
  const extra = path.join(area, 'extra');
  wheel(path.join(extra, 'numpy-2.3.5-cp311-cp311-win_amd64.whl'), 'numpy', '2.3.5');
  await run(
    uv,
    [
      'pip',
      'install',
      '--python',
      python,
      '--offline',
      '--no-index',
      '--find-links',
      extra,
      'torchaudio==2.8.0',
      'torchvision==0.23.0',
      'numpy==2.3.5',
    ],
    env,
  );
  await run(
    python,
    [
      '-I',
      '-c',
      "from importlib.metadata import version; assert version('torch') == '2.8.0+cu126'; assert version('numpy') == '2.3.5'",
    ],
    env,
  );
  let downloadCalls = 0;
  await installTorch(uv, args, env, () => {}, run, 'cuda', 'auto', {
    fetchIndex: services.fetchIndex,
    download: async () => {
      downloadCalls++;
    },
  });
  assert.equal(downloadCalls, 0);
  console.log(
    JSON.stringify({
      area,
      realUvInstall: true,
      cudaVariantPreserved: true,
      retryReusesInstalledWheels: true,
      networkRequests: 0,
    }),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
