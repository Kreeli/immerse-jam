const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { difference, merge } = require('../shared/project-patch.cjs');
const { createInteractionFixture } = require('../scripts/fixtures.cjs');

test('a stale mixer edit preserves newer analysis, practice fields and recording tracks', () => {
  const { store, p } = createInteractionFixture(1);
  const old = store.get(p.id);
  const latest = store.get(p.id);
  latest.analysis.bpm = 150;
  latest.practice.pitch = 3;
  store.save(latest);
  const edited = {
    ...old,
    practice: { ...old.practice, master: 0.4 },
    tracks: old.tracks.map((t, i) => (i ? t : { ...t, pan: -0.3 })),
  };
  const patch = difference(old, edited);
  assert.deepEqual(patch.practice, { master: 0.4 });
  assert.equal(patch.analysis, undefined);
  const saved = store.update(p.id, patch);
  assert.equal(saved.analysis.bpm, 150);
  assert.equal(saved.practice.pitch, 3);
  assert.equal(saved.practice.master, 0.4);
  assert.equal(saved.tracks[0].pan, -0.3);
  assert.throws(() => merge({ tracks: [] }, patch), /tracks have changed/);
});

test('recovery restores media-backed projects when the main manifest is missing', () => {
  const { store, p } = createInteractionFixture(1);
  store.save({ ...p, title: 'edited' });
  fs.unlinkSync(path.join(store.dir(p.id), 'project.json'));
  const recovered = store.recover(p.id);
  assert.equal(recovered.id, p.id);
  assert.ok(fs.statSync(store.asset(p.id, recovered.original)).isFile());
});

test('receiving a newer revision creates a copy and preserves local edits', async () => {
  const { Store } = require('../desktop/store.cjs');
  const { pack, importArchive } = require('../desktop/archive.cjs');
  const { store, p, data } = createInteractionFixture(1);
  const other = new Store(path.join(data, 'receiver'));
  const file = path.join(data, 'sharing.ijam');
  await pack(store, p.id, file, true);
  const first = await importArchive(other, file);
  other.update(first.id, { title: 'my local edit' });
  assert.equal((await importArchive(other, file)).id, first.id);
  store.update(p.id, {
    practice: { master: 0.3 },
    bookmarks: [{ id: 'loop', title: 'solo', start: 0.1, end: 0.8 }],
  });
  await pack(store, p.id, file, true);
  const second = await importArchive(other, file);
  assert.notEqual(second.id, first.id);
  assert.equal(second.practice.master, 0.3);
  assert.equal(second.bookmarks[0].title, 'solo');
  assert.equal(other.get(first.id).title, 'my local edit');
});
