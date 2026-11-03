const test = require('node:test');
const assert = require('node:assert/strict');
const { chunks, createNetwork } = require('../desktop/network.cjs');
const { validRanges, downloadModel } = require('../desktop/runtime.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto');
test(
  'idle timeout reaches caller even if transport cancel never settles',
  { timeout: 2000 },
  async () => {
    let cancelled = false,
      signal;
    const response = {
      body: new ReadableStream({
        pull() {
          return new Promise(() => {});
        },
        cancel() {
          cancelled = true;
          return new Promise(() => {});
        },
      }),
    };
    const network = createNetwork(
      {
        app: { whenReady: async () => {} },
        session: {
          defaultSession: {
            fetch: async (_url, options) => {
              signal = options.signal;
              return response;
            },
          },
        },
      },
      {},
    );
    await network.fetch('https://example.invalid/model');
    await assert.rejects(async () => {
      for await (const b of chunks(response, 25)) {
      }
    }, /没有进展/);
    assert.ok(cancelled);
    assert.ok(signal.aborted);
  },
);
test('mirror switch resumes only with the same pinned digest and valid range layout', () => {
  const state = {
    url: 'source-a',
    sha256: 'a'.repeat(64),
    total: 800,
    existing: 0,
    ranges: Array.from({ length: 8 }, (_, i) => ({
      start: i * 100,
      end: i * 100 + 99,
      received: 10,
    })),
  };
  assert.ok(validRanges(state, 'source-b', 800, 800, 'a'.repeat(64)));
  assert.equal(validRanges(state, 'source-b', 800, 800, 'b'.repeat(64)), false);
  assert.equal(validRanges(state, 'source-b', 801, 800, 'a'.repeat(64)), false);
});
test(
  'more than two interrupted bodies continue in the same download without reopening the app',
  { timeout: 15000 },
  async (t) => {
    const root = path.resolve('.runtime/test-workspaces');
    fs.mkdirSync(root, { recursive: true });
    const dir = fs.mkdtempSync(path.join(root, 'reconnect-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const total = 16 * 1024 * 1024,
      dest = path.join(dir, 'model'),
      existing = total - 256;
    fs.writeFileSync(dest + '.part', Buffer.alloc(existing));
    let requests = 0;
    const server = http.createServer((req, res) => {
      const [, a, b] = /bytes=(\d+)-(\d+)/.exec(req.headers.range);
      const start = +a,
        end = +b;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': end - start + 1,
      });
      if (end === 0) {
        res.end(Buffer.alloc(1));
        return;
      }
      requests++;
      if (end - start + 1 > 8) {
        res.write(Buffer.alloc(8, 97));
        setTimeout(() => res.destroy(), 15);
      } else res.end(Buffer.alloc(end - start + 1, 97));
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const hash = crypto
      .createHash('sha256')
      .update(Buffer.alloc(existing))
      .update(Buffer.alloc(256, 97))
      .digest('hex');
    await downloadModel(`http://127.0.0.1:${server.address().port}/model`, dest, hash);
    assert.ok(requests >= 32);
    assert.equal(fs.statSync(dest).size, total);
    assert.equal(fs.existsSync(dest + '.ranges.json'), false);
  },
);
test('installer-style retry resumes an interrupted single-file transfer', async (t) => {
  const root = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'single-resume-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const body = Buffer.alloc(65536, 71),
    dest = path.join(dir, 'runtime.bin'),
    offsets = [];
  let first = true;
  const server = http.createServer((req, res) => {
    const start = Number(/bytes=(\d+)-/.exec(req.headers.range || '')?.[1] || 0);
    offsets.push(start);
    res.writeHead(start ? 206 : 200, {
      'Content-Length': body.length - start,
      ...(start ? { 'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}` } : {}),
    });
    if (first) {
      first = false;
      res.write(body.subarray(0, 8192));
      setTimeout(() => res.destroy(), 20);
    } else res.end(body.subarray(start));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = `http://127.0.0.1:${server.address().port}/runtime`,
    sha = crypto.createHash('sha256').update(body).digest('hex'),
    download = require('../desktop/runtime.cjs').download;
  await assert.rejects(download(url, dest, sha));
  assert.equal(fs.statSync(dest + '.part').size, 8192);
  await download(url, dest, sha);
  assert.equal(offsets[1], 8192);
  assert.deepEqual(fs.readFileSync(dest), body);
});
