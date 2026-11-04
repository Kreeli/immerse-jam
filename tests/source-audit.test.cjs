const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('../desktop/store.cjs');
const { PeerFiles } = require('../desktop/peer-files.cjs');
const { Takes, wavHeader } = require('../desktop/takes.cjs');
function fixture(t) {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const area = fs.mkdtempSync(path.join(parent, 'source-audit-'));
  t.after(() => {
    assert.equal(path.dirname(area), parent);
    fs.rmSync(area, { recursive: true, force: true });
  });
  const store = new Store(path.join(area, 'library'));
  const audio = path.join(area, 'source.wav');
  fs.writeFileSync(audio, Buffer.concat([wavHeader(4800, 48000), Buffer.alloc(4800 * 8)]));
  return { area, store, project: store.create(audio), audio };
}
test('a mismatched project identity cannot overwrite a different song', (t) => {
  const { store, project: first, audio } = fixture(t);
  const second = store.create(audio, 'Keep this song');
  const secondFile = path.join(store.dir(second.id), 'project.json');
  const before = fs.readFileSync(secondFile);
  const firstFile = path.join(store.dir(first.id), 'project.json');
  const invalid = JSON.stringify({ ...first, id: second.id });
  fs.writeFileSync(firstFile, invalid);
  assert.throws(() => store.update(first.id, { title: 'Wrong target' }));
  assert.deepEqual(fs.readFileSync(secondFile), before);
  assert.equal(fs.readFileSync(firstFile, 'utf8'), invalid);
  assert.ok(store.list().find((p) => p.id === first.id)?.broken);
});
test(
  'project assets and project directories cannot escape through directory links',
  { skip: process.platform !== 'win32' },
  (t) => {
    const { area, store, project } = fixture(t);
    const outside = path.join(area, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'untouched.txt'), 'preserve');
    const link = path.join(store.dir(project.id), 'media/linked');
    fs.symlinkSync(outside, link, 'junction');
    assert.throws(() => store.asset(project.id, 'media/linked/untouched.txt'));
    assert.throws(() => store.asset(project.id, 'media/linked/not-created/future.wav'));
    const linkedId = crypto.randomUUID();
    fs.symlinkSync(outside, path.join(store.projects, linkedId), 'junction');
    assert.throws(() => store.dir(linkedId));
    assert.equal(fs.readFileSync(path.join(outside, 'untouched.txt'), 'utf8'), 'preserve');
    assert.equal(
      store.asset(project.id, 'media/new/subfolder.wav'),
      path.join(store.dir(project.id), 'media/new/subfolder.wav'),
    );
    const entry = path.join(area, 'library-entry');
    fs.symlinkSync(store.base, entry, 'junction');
    assert.equal(new Store(entry).get(project.id).id, project.id);
    fs.symlinkSync(
      path.join(outside, 'missing'),
      path.join(store.dir(project.id), 'media/broken'),
      'junction',
    );
    assert.throws(() => store.asset(project.id, 'media/broken/future.wav'));
  },
);
test('peer receive never accepts a truncated file after partial disk writes', (t) => {
  const { store } = fixture(t),
    peer = new PeerFiles(store, () => {});
  t.after(() => peer.close());
  const bytes = Buffer.from('Complete song bytes, including the tail.');
  const id = peer.begin({
    name: 'song.ijam',
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
  const fd = peer.incoming.get(id).fd,
    write = fs.writeSync;
  t.mock.method(
    fs,
    'writeSync',
    function (handle, data, offset = 0, length = data.length - offset, position = null) {
      return write.call(
        fs,
        handle,
        data,
        offset,
        handle === fd ? Math.min(3, length) : length,
        position,
      );
    },
  );
  assert.equal(peer.append({ id, offset: 0, chunk: bytes }), bytes.length);
  assert.equal(peer.finish({ id }), true);
  assert.deepEqual(fs.readFileSync(peer.pending.get(id).file), bytes);
});
test('recording samples and the final WAV header survive partial disk writes', async (t) => {
  const { store, project } = fixture(t),
    takes = new Takes(store, 'unused-converter');
  t.after(() => takes.close());
  const session = takes.start(project.id, {
    anchorTime: 10,
    anchorPosition: 0,
    tempo: 1,
    pitch: 0,
    latencyMs: 0,
    sampleRate: 48000,
    mode: 'instrument',
  });
  const fd = takes.sessions.get(session.id).fd,
    write = fs.writeSync;
  t.mock.method(
    fs,
    'writeSync',
    function (handle, data, offset = 0, length = data.length - offset, position = null) {
      return write.call(
        fs,
        handle,
        data,
        offset,
        handle === fd ? Math.min(length, length <= 44 ? 7 : 512) : length,
        position,
      );
    },
  );
  const pcm = Buffer.from(new Float32Array(4800 * 2).fill(0.25).buffer);
  assert.equal(takes.append(session.id, 0, 10, pcm), 4800);
  const saved = await takes.finish(session.id);
  assert.equal(saved.takes[0].duration, 0.1);
  assert.deepEqual(
    fs.readFileSync(store.asset(saved.id, saved.takes[0].file)),
    Buffer.concat([wavHeader(4800, 48000), pcm]),
  );
});
test('a write making no progress fails without advancing the recording clock', (t) => {
  const { store, project } = fixture(t),
    takes = new Takes(store, 'unused-converter');
  t.after(() => takes.close());
  const session = takes.start(project.id, {
    anchorTime: 10,
    anchorPosition: 0,
    tempo: 1,
    pitch: 0,
    latencyMs: 0,
    sampleRate: 48000,
    mode: 'instrument',
  });
  const fd = takes.sessions.get(session.id).fd,
    write = fs.writeSync;
  const mocked = t.mock.method(fs, 'writeSync', function (handle, ...args) {
    return handle === fd ? 0 : write.call(fs, handle, ...args);
  });
  assert.throws(
    () => takes.append(session.id, 0, 10, Buffer.alloc(800)),
    (error) => error.code === 'EIO',
  );
  assert.equal(takes.sessions.get(session.id).frames, 0);
  assert.equal(takes.sessions.get(session.id).sequence, 0);
  mocked.mock.restore();
});
test(
  'a failed outgoing batch closes and removes its already-prepared files',
  { timeout: 15000 },
  async (t) => {
    const { store, project } = fixture(t),
      peer = new PeerFiles(store, () => {});
    t.after(() => peer.close());
    await assert.rejects(peer.prepare([project.id, crypto.randomUUID()]));
    assert.equal(peer.outgoing.size, 0);
    assert.deepEqual(fs.readdirSync(path.join(store.base, 'transfers')), []);
  },
);
test(
  'closing during outgoing hashing cannot resurrect an old transfer',
  { timeout: 15000 },
  async (t) => {
    const { store, project } = fixture(t),
      peer = new PeerFiles(store, () => {});
    t.after(() => peer.close());
    const read = fs.createReadStream,
      transfers = path.join(store.base, 'transfers') + path.sep;
    let interrupted = false;
    t.mock.method(fs, 'createReadStream', function (file, ...args) {
      const stream = read.call(fs, file, ...args);
      if (!String(file).startsWith(transfers)) return stream;
      return (async function* () {
        interrupted = true;
        peer.close();
        for await (const chunk of stream) yield chunk;
      })();
    });
    await assert.rejects(peer.prepare([project.id]));
    assert.equal(interrupted, true);
    assert.equal(peer.outgoing.size, 0);
    assert.deepEqual(fs.readdirSync(path.join(store.base, 'transfers')), []);
  },
);
test(
  'a changed outgoing file fails immediately instead of sending zero padding',
  { timeout: 15000 },
  async (t) => {
    const { store, project } = fixture(t),
      peer = new PeerFiles(store, () => {});
    t.after(() => peer.close());
    const [item] = await peer.prepare([project.id]);
    fs.truncateSync(peer.outgoing.get(item.id).file, 0);
    assert.throws(() => peer.read({ id: item.id, offset: 0, binary: true }));
  },
);
