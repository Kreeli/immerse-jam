const { test } = require('node:test');
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { createInteractionFixture } = require('../scripts/fixtures.cjs');
test('device-local order does not edit the project and legacy order is omitted from export', async (t) => {
  const { store, p, data } = createInteractionFixture(1);
  t.after(() => {
    assert.equal(path.dirname(data), path.resolve('.runtime/test-workspaces'));
    fs.rmSync(data, { recursive: true, force: true });
  });
  const memory = new Map(),
    old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
    },
  });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'localStorage', old);
    else delete globalThis.localStorage;
  });
  const { orderedTracks, orderKey, writeTrackOrder, readTrackOrder } =
    await import('../src/shared/track-order.ts');
  const ids = p.tracks.map((track) => track.id).reverse(),
    key = orderKey(p.id, 'mixer'),
    before = store.get(p.id);
  writeTrackOrder(key, ids);
  assert.deepEqual(readTrackOrder(key), ids);
  assert.deepEqual(store.get(p.id), before);
  assert.deepEqual(
    orderedTracks(p.tracks, readTrackOrder(key)).map((t) => t.id),
    ids,
  );
  const fresh = { id: 'new', file: 'new.wav' };
  assert.deepEqual(
    orderedTracks([...p.tracks, fresh], ['missing', ...ids]).map((t) => t.id),
    [...ids, 'new'],
  );
  store.update(p.id, { trackOrder: { mixer: ids } });
  const archive = path.join(data, 'ordered.ijam'),
    out = path.join(data, 'unpacked');
  await require('../desktop/archive.cjs').pack(store, p.id, archive, true);
  await require('../desktop/archive.cjs').extractLocal(archive, out);
  const manifest = JSON.parse(fs.readFileSync(path.join(out, 'project.json')));
  assert.equal(manifest.trackOrder, undefined);
  assert.deepEqual(manifest.tracks, before.tracks);
});
