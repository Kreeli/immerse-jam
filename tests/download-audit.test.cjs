const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
function area(t) {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'download-audit-'));
  t.after(() => {
    assert.equal(path.dirname(root), parent);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('transport cancellation blocked progress')),
          1500,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
test(
  'package source probing finishes even if transport cancellation never settles',
  { timeout: 5000 },
  async () => {
    const filename = 'pinned.whl';
    async function fetch(url) {
      if (url.endsWith('/sample/'))
        return { ok: true, text: async () => '<a href="' + filename + '">wheel</a>' };
      let first = true;
      return {
        ok: true,
        headers: new Headers({ 'content-type': 'application/octet-stream' }),
        body: {
          getReader: () => ({
            read: async () =>
              first
                ? ((first = false), { value: Buffer.alloc(65536), done: false })
                : { done: true },
            cancel: () => new Promise(() => {}),
            releaseLock() {},
          }),
        },
      };
    }
    const result = await bounded(
      require('../desktop/package-index.cjs').rankIndexes(
        ['https://one.invalid/', 'https://two.invalid/'],
        'sample',
        filename,
        fetch,
      ),
    );
    assert.equal(result.length, 2);
  },
);
test(
  'model probing cannot hang before falling back to a regular download',
  { timeout: 5000 },
  async (t) => {
    const root = area(t),
      file = path.join(root, 'model.bin'),
      bytes = Buffer.from('Verified model fixture');
    t.mock.method(globalThis, 'fetch', async (_url, options) => {
      if (options.headers?.Range === 'bytes=0-0')
        return {
          status: 200,
          headers: new Headers(),
          body: { cancel: () => new Promise(() => {}) },
        };
      return new Response(bytes);
    });
    await bounded(
      require('../desktop/runtime.cjs').downloadModel(
        'https://fixture.invalid/model',
        file,
        crypto.createHash('sha256').update(bytes).digest('hex'),
      ),
    );
    assert.deepEqual(fs.readFileSync(file), bytes);
  },
);
test('bundled components propagate a disk-full error without starting a network fallback', async (t) => {
  const root = area(t),
    source = path.join(root, 'components'),
    dest = path.join(root, 'runtime/fixture.bin');
  fs.mkdirSync(source);
  const bytes = Buffer.from('Pinned component');
  fs.writeFileSync(path.join(source, 'fixture.bin'), bytes);
  const previous = process.env.IMMERSE_COMPONENTS_DIR;
  process.env.IMMERSE_COMPONENTS_DIR = source;
  t.after(() => {
    if (previous === undefined) delete process.env.IMMERSE_COMPONENTS_DIR;
    else process.env.IMMERSE_COMPONENTS_DIR = previous;
  });
  const copy = fs.promises.copyFile;
  t.mock.method(fs.promises, 'copyFile', async function (from, to, ...args) {
    if (from === path.join(source, 'fixture.bin'))
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    return copy.call(fs.promises, from, to, ...args);
  });
  await assert.rejects(
    require('../desktop/installer-assets.cjs').copyBundled(
      'fixture.bin',
      dest,
      crypto.createHash('sha256').update(bytes).digest('hex'),
    ),
    (error) => error.code === 'ENOSPC',
  );
});
