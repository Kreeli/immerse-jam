const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { installTorch } = require('../desktop/package-index.cjs');
const { mirrorWheel } = require('../desktop/torch-wheels.cjs');
const pins = require('../shared/torch-wheels.json');
const args = [
  'pip',
  'install',
  '--python',
  'python.exe',
  'torch==2.8.0',
  'torchaudio==2.8.0',
  'torchvision==0.23.0',
];
const env = { UV_CACHE_DIR: path.resolve('.runtime/test-workspaces/wheel-unit-cache') };
test('large wheels use resumable byte downloads, pinned digests, and offline dependency-free installation', async () => {
  const runs = [],
    downloads = [],
    events = [];
  await installTorch(
    'uv',
    args,
    env,
    (e) => events.push(e),
    async (_exe, argv) => {
      runs.push(argv);
      if (runs.length === 1) throw new Error('not cached');
    },
    'cuda',
    'mirror',
    {
      fetchIndex: async (url) => {
        const item = pins.cu126.find((item) => url.endsWith('/' + item.name + '/'));
        return new Response(
          `<a href="../${item.name}-${item.version}%2Bcu126-cp311-cp311-win_amd64.whl#sha256=${item.sha256}">wheel</a>`,
        );
      },
      download: async (url, dest, hash, emit) => {
        downloads.push({ url, dest, hash });
        if (downloads.length === 1) throw new Error('mirror interrupted');
        emit({
          file: path.basename(dest),
          received: 512,
          total: 1024,
          progress: 0.5,
          bytesPerSecond: 256,
        });
      },
    },
  );
  assert.equal(runs.length, 2);
  assert.ok(runs[0].includes('torch==2.8.0+cu126'));
  assert.equal(downloads.length, 4);
  assert.equal(downloads[0].dest, downloads[1].dest);
  assert.equal(downloads[0].hash, downloads[1].hash);
  assert.ok(downloads[1].url.startsWith('https://download.pytorch.org/whl/cu126/'));
  assert.deepEqual(
    downloads.slice(1).map((item) => item.hash),
    pins.cu126.map((item) => item.sha256),
  );
  assert.equal(runs[1].filter((arg) => arg.endsWith('.whl')).length, 3);
  assert.ok(runs[1].includes('--offline'));
  assert.ok(runs[1].includes('--no-deps'));
  assert.ok(!runs[1].includes('--index-url'));
  assert.ok(!runs[1].includes('torch==2.8.0'));
  assert.equal(events.filter((e) => e.progress === 0.5).length, 3);
  assert.match(events.at(-1).message, /解压并安装/);
  assert.equal(events.at(-1).progress, undefined);
});
test('existing installed or cached variant needs no network or large wheel download', async () => {
  let calls = 0;
  await installTorch(
    'uv',
    args,
    env,
    () => {},
    async (_exe, argv) => {
      calls++;
      assert.ok(argv.includes('torch==2.8.0+cpu'));
      assert.ok(argv.includes('--offline'));
    },
    'cpu',
    'auto',
    {
      fetchIndex: async () => {
        throw new Error('network must not be used');
      },
      download: async () => {
        assert.fail('must reuse cached wheels');
      },
    },
  );
  assert.equal(calls, 1);
});
test('a mirror must offer the exact wheel and cannot override its pinned digest', async () => {
  const item = pins.cpu[0],
    file = 'torch-2.8.0+cpu-cp311-cp311-win_amd64.whl';
  await assert.rejects(
    mirrorWheel(
      'https://example.invalid/',
      item,
      file,
      async () =>
        new Response(`<a href="https://example.invalid/${file}#sha256=${'0'.repeat(64)}">bad</a>`),
    ),
    /对应/,
  );
});
test('blank subprocess output cannot erase progress or indefinitely reset the no-progress timeout', async () => {
  const events = [];
  await assert.rejects(
    require('../desktop/runtime.cjs').run(
      process.execPath,
      ['-e', 'setInterval(()=>process.stdout.write(" \\n\\u001b[0m"),20)'],
      {},
      (e) => events.push(e),
      { stallMs: 180 },
    ),
    /没有进展/,
  );
  assert.deepEqual(events, []);
});
test('native progress keeps large-wheel byte counts when a whitespace event arrives', async () => {
  fs.mkdirSync(path.resolve('.runtime/test-workspaces'), { recursive: true });
  const area = fs.mkdtempSync(path.join(path.resolve('.runtime/test-workspaces'), 'wheel-status-'));
  const file = path.join(area, 'status.ini'),
    status = require('../desktop/setup-status.cjs').create(file);
  status.send({
    file: 'torch.whl',
    received: 1024 * 1048576,
    total: 2048 * 1048576,
    progress: 0.5,
    bytesPerSecond: 1048576,
  });
  status.send({ type: 'progress', message: ' \r\n ' });
  await new Promise((resolve) => setTimeout(resolve, 150));
  const text = fs.readFileSync(file, 'utf16le');
  assert.match(text, /percent=50/);
  assert.match(text, /transfer=1024.0 MiB \/ 2048.0 MiB/);
  status.finish();
});
