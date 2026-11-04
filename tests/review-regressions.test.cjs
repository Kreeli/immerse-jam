const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  http = require('node:http');
const { Store, atomicJson } = require('../desktop/store.cjs');
const { Takes, wavHeader } = require('../desktop/takes.cjs');
const { download, validRanges, run } = require('../desktop/runtime.cjs');
function fixture(t) {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source.wav');
  fs.writeFileSync(source, Buffer.concat([wavHeader(4800, 48000), Buffer.alloc(4800 * 8)]));
  const store = new Store(path.join(root, 'library'));
  return { root, source, store, p: store.create(source) };
}
test('failed batch take import rolls back only its own recordings and preserves concurrent edits', async (t) => {
  const { root, source, store, p } = fixture(t);
  const takes = new Takes(store, 'unused'),
    commit = takes.commit.bind(takes);
  let count = 0;
  takes.commit = async (meta, raw) => {
    if (++count === 2) throw new Error('second source damaged');
    const captured = store.asset(p.id, meta.relative + '/raw.wav');
    fs.copyFileSync(raw, captured);
    await commit({ ...meta, sampleRate: 48000 }, captured);
    await new Promise((r) => setImmediate(r));
    store.update(p.id, { title: 'concurrent title', practice: { master: 0.3 } });
  };
  await assert.rejects(takes.import(p.id, [source, source]), /second source damaged/);
  const saved = store.get(p.id);
  assert.equal(saved.title, 'concurrent title');
  assert.equal(saved.practice.master, 0.3);
  assert.equal(saved.takes.length, 0);
  assert.deepEqual(saved.selectedTakeIds, []);
});
test('bad recovery metadata does not block a valid pending recording or delete its raw audio', async (t) => {
  const { store, p } = fixture(t),
    takes = new Takes(store, 'unused');
  const bad = store.asset(p.id, 'recordings/' + crypto.randomUUID());
  fs.mkdirSync(bad, { recursive: true });
  fs.writeFileSync(path.join(bad, 'pending.json'), '{broken');
  const started = takes.start(p.id, {
    anchorTime: 1,
    anchorPosition: 0,
    tempo: 1,
    pitch: 0,
    latencyMs: 0,
    sampleRate: 48000,
    mode: 'instrument',
  });
  takes.append(started.id, 0, 1, new Uint8Array(new Float32Array(4800 * 2).buffer));
  takes.close();
  const saved = await new Takes(store, 'unused').recover(p.id);
  assert.equal(saved.takes.length, 1);
  assert.ok(fs.readdirSync(bad).some((name) => name.startsWith('pending.json.bad-')));
  assert.ok(fs.existsSync(store.asset(p.id, saved.takes[0].rawFile)));
});
test('deleting another score preserves the bound score MIDI and manual alignment', (t) => {
  const { store, p } = fixture(t);
  for (const name of ['a.mid', 'b.mid', 'alignment.mid']) {
    const file = store.asset(p.id, 'attachments/' + name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'midi');
  }
  p.attachments = ['a', 'b'].map((id) => ({
    id,
    name: id + '.mid',
    file: 'attachments/' + id + '.mid',
  }));
  p.scoreAttachmentId = 'a';
  p.scoreMidi = 'attachments/alignment.mid';
  p.alignment = { points: [{ scoreTime: 0, audioTime: 1, confidence: 1 }] };
  store.save(p);
  const saved = require('../desktop/content-removal.cjs').removeContent(
    store,
    p.id,
    'b',
    'attachment',
  );
  assert.equal(saved.scoreAttachmentId, 'a');
  assert.deepEqual(saved.alignment, p.alignment);
  assert.ok(fs.existsSync(store.asset(p.id, p.scoreMidi)));
});
test('failed project creation leaves no incomplete project folder', (t) => {
  const { store, root } = fixture(t),
    before = fs.readdirSync(store.projects);
  assert.throws(() => store.create(path.join(root, 'missing.wav')));
  assert.deepEqual(fs.readdirSync(store.projects), before);
});
test('atomic JSON survives transient Windows destination locks without leaving temporary files', (t) => {
  const { root } = fixture(t),
    file = path.join(root, 'state.json'),
    rename = fs.renameSync;
  let attempts = 0;
  t.mock.method(fs, 'renameSync', (a, b) => {
    if (b === file && ++attempts < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' });
    return rename(a, b);
  });
  atomicJson(file, { complete: true });
  assert.equal(attempts, 3);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), { complete: true });
  assert.ok(!fs.readdirSync(root).some((name) => name.endsWith('.tmp')));
});
test('wrong single-stream Content-Range is rejected without appending or discarding the existing prefix', async (t) => {
  const { root } = fixture(t),
    file = path.join(root, 'download.bin');
  fs.writeFileSync(file + '.part', 'prefix');
  const server = http.createServer((req, res) => {
    res.writeHead(206, { 'Content-Range': 'bytes 0-5/12', 'Content-Length': 6 });
    res.end('prefix');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  await assert.rejects(
    download('http://127.0.0.1:' + server.address().port, file, 'a'.repeat(64)),
    /分块/,
  );
  assert.equal(fs.readFileSync(file + '.part', 'utf8'), 'prefix');
});
test('a changed digest invalidates a range cache even when the URL has not changed', () => {
  const state = {
    url: 'same',
    sha256: 'a'.repeat(64),
    total: 800,
    existing: 0,
    ranges: Array.from({ length: 8 }, (_, i) => ({
      start: i * 100,
      end: i * 100 + 99,
      received: 10,
    })),
  };
  assert.equal(validRanges(state, 'same', 800, 800, 'b'.repeat(64)), false);
});
test(
  'runtime subprocesses stop after a bounded period with no output or file activity',
  { timeout: 5000 },
  async () => {
    await assert.rejects(
      run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {}, () => {}, { stallMs: 100 }),
      /没有进展/,
    );
  },
);
test('malformed row sizes are rejected before reaching the chord rendering loop', () => {
  const { validateCharts } = require('../desktop/charts.cjs');
  for (const barsPerRow of [0, -1, NaN, Infinity, '4'])
    assert.throws(() => validateCharts([{ id: 'bad', bars: [], meter: 4, barsPerRow }]));
});
test('enharmonic spellings transpose by their actual pitch rather than C', async () => {
  const { transpose } = await import('../src/features/analysis/transposition.ts');
  assert.equal(transpose('Cb', 1), 'C');
  assert.equal(transpose('Fb', 1), 'F');
  assert.equal(transpose('E#', 1), 'F♯');
  assert.equal(transpose('B#', 1), 'C♯');
});
test('export uses the same snapshot bytes for checksums and media even if the source later changes', async (t) => {
  const { root, store, p } = fixture(t),
    original = fs.readFileSync(store.asset(p.id, p.original));
  const copy = fs.promises.copyFile;
  t.mock.method(fs.promises, 'copyFile', async (a, b, ...args) => {
    await copy(a, b, ...args);
    if (a === store.asset(p.id, p.original)) fs.writeFileSync(a, 'concurrent replacement');
  });
  const file = path.join(root, 'export.ijam');
  await require('../desktop/archive.cjs').pack(store, p.id, file, true);
  const zip = new (require('adm-zip'))(file),
    bytes = zip.readFile(p.original);
  const checksums = JSON.parse(zip.readAsText('checksums.json'));
  assert.deepEqual(bytes, original);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), checksums[p.original]);
});
test('failed export preserves an existing archive and removes its incomplete snapshot', async (t) => {
  const { root, store, p } = fixture(t),
    file = path.join(root, 'backup.ijam');
  fs.writeFileSync(file, 'previous backup');
  const copy = fs.promises.copyFile;
  t.mock.method(fs.promises, 'copyFile', async (a, b, ...args) => {
    if (b.includes('.ijam-snapshot-'))
      throw Object.assign(new Error('full disk'), { code: 'ENOSPC' });
    return copy(a, b, ...args);
  });
  await assert.rejects(
    require('../desktop/archive.cjs').pack(store, p.id, file, true),
    /full disk/,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'previous backup');
  assert.ok(!fs.readdirSync(root).some((name) => name.startsWith('.ijam-snapshot-')));
});
