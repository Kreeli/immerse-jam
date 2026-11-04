const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  http = require('node:http');
const { Store } = require('../desktop/store.cjs');
const { Takes, wavHeader } = require('../desktop/takes.cjs');
function area(t) {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'io-audit-'));
  t.after(() => {
    assert.equal(path.dirname(root), parent);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function partialWrites(t, prefix) {
  const open = fs.openSync,
    write = fs.writeSync,
    close = fs.closeSync,
    handles = new Set();
  t.mock.method(fs, 'openSync', function (file, ...args) {
    const fd = open.call(fs, file, ...args);
    if (String(file).startsWith(prefix)) handles.add(fd);
    return fd;
  });
  t.mock.method(fs, 'closeSync', function (fd) {
    handles.delete(fd);
    return close.call(fs, fd);
  });
  t.mock.method(
    fs,
    'writeSync',
    function (fd, bytes, offset = 0, length = bytes.length - offset, position = null) {
      return write.call(
        fs,
        fd,
        bytes,
        offset,
        handles.has(fd) ? Math.min(23, length) : length,
        position,
      );
    },
  );
}
test('archive extraction writes all bytes before accepting its length and CRC', async (t) => {
  const root = area(t),
    target = path.join(root, 'extract');
  const bytes = crypto.randomBytes(8192),
    zip = new (require('adm-zip'))(),
    file = path.join(root, 'sample.zip');
  zip.addFile('media/audio.wav', bytes);
  zip.writeZip(file);
  partialWrites(t, target);
  await require('../desktop/archive.cjs').extractLocal(file, target);
  assert.deepEqual(fs.readFileSync(path.join(target, 'media/audio.wav')), bytes);
});
test(
  'resumable downloads retain the pinned bytes across partial writes',
  { timeout: 10000 },
  async (t) => {
    const root = area(t),
      file = path.join(root, 'download.bin'),
      bytes = crypto.randomBytes(8192);
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Length': bytes.length });
      res.end(bytes);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    partialWrites(t, file);
    await require('../desktop/runtime.cjs').download(
      'http://127.0.0.1:' + server.address().port,
      file,
      crypto.createHash('sha256').update(bytes).digest('hex'),
    );
    assert.deepEqual(fs.readFileSync(file), bytes);
  },
);
test('closing a recording releases the handle even when its final header cannot be written', (t) => {
  const root = area(t),
    store = new Store(path.join(root, 'library')),
    source = path.join(root, 'source.wav');
  fs.writeFileSync(source, Buffer.concat([wavHeader(4800, 48000), Buffer.alloc(4800 * 8)]));
  const project = store.create(source),
    manager = new Takes(store, 'unused');
  const { id } = manager.start(project.id, {
    anchorTime: 0,
    anchorPosition: 0,
    tempo: 1,
    pitch: 0,
    latencyMs: 0,
    sampleRate: 48000,
    mode: 'instrument',
  });
  const session = manager.sessions.get(id),
    write = fs.writeSync;
  const mocked = t.mock.method(fs, 'writeSync', function (fd, ...args) {
    if (fd === session.fd) throw Object.assign(new Error('write failure'), { code: 'EIO' });
    return write.call(fs, fd, ...args);
  });
  manager.close();
  mocked.mock.restore();
  assert.throws(
    () => fs.fstatSync(session.fd),
    (error) => error.code === 'EBADF',
  );
  assert.ok(fs.existsSync(store.asset(project.id, session.relative + '/pending.json')));
  assert.ok(fs.existsSync(store.asset(project.id, session.relative + '/raw.wav')));
});
