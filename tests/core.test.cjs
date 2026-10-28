const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Store, contained } = require('../desktop/store.cjs');
const { pack, importArchive, extract } = require('../desktop/archive.cjs');
const { PeerFiles } = require('../desktop/peer-files.cjs');
const { validateManifest } = require('../desktop/models.cjs');
function fixture(t) {
  const parent = path.resolve('.runtime', 'test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, 'case-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test('portable project preserves bytes, score, settings; repeat import deduplicates', async (t) => {
  const dir = fixture(t),
    a = new Store(path.join(dir, 'a')),
    b = new Store(path.join(dir, 'b'));
  const song = path.join(dir, 'song.wav');
  const bytes = crypto.randomBytes(65536);
  fs.writeFileSync(song, bytes);
  const p = a.create(song);
  p.bookmarks = [{ id: 'one', title: 'solo', start: 2, end: 4 }];
  p.practice.pitch = 3;
  a.save(p);
  const zip = path.join(dir, 'song.ijam');
  await pack(a, p.id, zip, true);
  const result = await importArchive(b, zip);
  assert.deepEqual(fs.readFileSync(b.asset(result.id, result.original)), bytes);
  assert.equal(result.practice.pitch, 3);
  assert.equal(result.bookmarks[0].end, 4);
  assert.equal((await importArchive(b, zip)).duplicate, true);
  assert.equal(b.list().length, 1);
});
test('reject traversal and a damaged archive before exposing a project', async (t) => {
  const dir = fixture(t);
  assert.throws(() => contained(dir, '../outside'));
  const zip = new (require('adm-zip'))();
  zip.addFile('file.bin', Buffer.from('content'));
  const file = path.join(dir, 'bad.zip');
  zip.writeZip(file);
  const buf = fs.readFileSync(file);
  buf[buf.readUInt16LE(26) + buf.readUInt16LE(28) + 30] ^= 255;
  fs.writeFileSync(file, buf);
  await assert.rejects(extract(file, path.join(dir, 'extract')));
});
test('custom model rejects duplicated or absent stem declarations', () => {
  const base = {
    schemaVersion: 1,
    name: 'custom',
    adapter: 'onnx-waveform',
    file: 'model.onnx',
    sampleRate: 44100,
    sha256: 'a'.repeat(64),
  };
  assert.throws(() => validateManifest({ ...base, stems: ['vocals', 'vocals'] }));
  assert.throws(() => validateManifest({ ...base, stems: [] }));
  assert.doesNotThrow(() => validateManifest({ ...base, stems: ['vocals', 'other'] }));
});
test('peer receiver enforces chunk order and end-to-end checksum', (t) => {
  const store = new Store(fixture(t)),
    events = [],
    peer = new PeerFiles(store, (e) => events.push(e));
  t.after(() => peer.close());
  const bytes = Buffer.from('a real song archive payload'),
    item = {
      name: 'song.ijam',
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    };
  const id = peer.begin(item);
  assert.throws(() => peer.append({ id, offset: 1, chunk: bytes.toString('base64') }));
  peer.append({ id, offset: 0, chunk: bytes.toString('base64') });
  assert.equal(peer.finish({ id }), true);
  assert.equal(events[0].type, 'incoming');
  const bad = peer.begin({ ...item, sha256: '0'.repeat(64) });
  peer.append({ id: bad, offset: 0, chunk: bytes.toString('base64') });
  assert.throws(() => peer.finish({ id: bad }));
  assert.equal(peer.pending.size, 1);
});
