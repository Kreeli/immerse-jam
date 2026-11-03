const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { Store } = require('../desktop/store.cjs');
const { removeContent } = require('../desktop/content-removal.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/content-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = path.join(root, 'source.wav');
  fs.writeFileSync(original, 'original');
  const store = new Store(path.join(root, 'data'));
  return { store, p: store.create(original), original };
}
function file(store, p, relative) {
  const dest = store.asset(p.id, relative);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, 'test');
  return dest;
}
test('attachment removal deletes only its project copy and keeps shared references', (t) => {
  const { store, p, original } = fixture(t);
  const dest = file(store, p, 'attachments/a.pdf');
  p.attachments = [
    { id: 'a', name: 'a.pdf', file: 'attachments/a.pdf' },
    { id: 'b', name: 'b.pdf', file: 'attachments/a.pdf' },
  ];
  store.save(p);
  removeContent(store, p.id, 'a', 'attachment');
  assert.ok(fs.existsSync(dest));
  const saved = removeContent(store, p.id, 'b', 'attachment');
  assert.equal(saved.attachments.length, 0);
  assert.ok(!fs.existsSync(dest));
  assert.equal(fs.readFileSync(original, 'utf8'), 'original');
});
test('score removal clears generated MIDI and alignment, failed commit keeps media', (t) => {
  const { store, p } = fixture(t);
  const score = file(store, p, 'attachments/a.mid'),
    midi = file(store, p, 'attachments/alignment.mid');
  p.attachments = [{ id: 'a', name: 'a.mid', file: 'attachments/a.mid' }];
  p.scoreMidi = 'attachments/alignment.mid';
  p.alignment = null;
  store.save(p);
  const save = store.save.bind(store);
  store.save = () => {
    throw Error('write failed');
  };
  assert.throws(() => removeContent(store, p.id, 'a', 'attachment'), /write failed/);
  assert.ok(fs.existsSync(score));
  store.save = save;
  const saved = removeContent(store, p.id, 'a', 'attachment');
  assert.equal(saved.scoreMidi, null);
  assert.ok(!fs.existsSync(score));
  assert.ok(!fs.existsSync(midi));
});
test('whole group removal preserves the source library and excludes library recordings from creation playback', async (t) => {
  const { store, p, original } = fixture(t);
  const id = crypto.randomUUID(),
    relative = `groups/${id}/bass.wav`;
  const dest = file(store, p, relative);
  p.kind = 'creation';
  p.sourceGroups = [
    {
      id,
      name: 'group',
      sourceTitle: 'source',
      tracks: [
        {
          id: crypto.randomUUID(),
          name: 'bass',
          file: relative,
          gain: 1,
          pan: 0,
          mute: false,
          solo: false,
        },
      ],
      gain: 1,
      start: 0,
      mute: false,
      solo: false,
    },
  ];
  store.save(p);
  const saved = removeContent(store, p.id, id, 'group');
  assert.equal(saved.sourceGroups.length, 0);
  assert.ok(!fs.existsSync(dest));
  assert.ok(fs.existsSync(original));
  const { activeTakes, sourceTracks } = await import('../src/audio/performance.ts');
  const take = {
    id: 'take',
    file: 'take.wav',
    gain: 1,
    pan: 0,
    mute: false,
    solo: true,
    start: 0,
    libraryOnly: true,
  };
  const project = { ...saved, takes: [take] };
  assert.equal(activeTakes(project).length, 0);
  assert.equal(sourceTracks(project).length, 0);
  assert.equal(require('../desktop/groups.cjs').creationTracks(project).length, 0);
  take.libraryOnly = false;
  assert.equal(activeTakes(project).length, 1);
});
