const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { createInteractionFixture } = require('../scripts/fixtures.cjs'),
  { createSession } = require('../desktop/sessions.cjs'),
  { addGroup, creationTracks } = require('../desktop/groups.cjs'),
  { pack, importArchive } = require('../desktop/archive.cjs'),
  { Store } = require('../desktop/store.cjs');
test('live envelopes retain source clock, latency, speed and gaps without stretching older samples', async () => {
  const { LiveEnvelope } = await import('../src/audio/live-envelope.ts');
  const live = new LiveEnvelope(10, 2, 1000, 2, 100);
  assert.equal(live.start, 1.8);
  const samples = new Float32Array(40);
  samples[0] = 0.4;
  samples[19] = 0.7;
  live.push(10.02, samples);
  assert.ok(Math.abs(live.peaks[4] - 0.4) < 1e-6);
  assert.ok(Math.abs(live.peaks[5] - 0.7) < 1e-6);
  assert.deepEqual(live.peaks.slice(0, 4), [0, 0, 0, 0]);
  const older = live.peaks.slice();
  live.push(11, new Float32Array([0.5, 0.5]));
  assert.deepEqual(live.peaks.slice(0, older.length), older);
  const window = live.window(3.8, 1);
  assert.ok(window.peaks.some((peak) => peak > 0.49));
  assert.ok(window.peaks.length < 105);
});
test('creation groups preserve independent media, scoped listening and archive/export routing', async (t) => {
  const { data, store, p, resultA, resultB } = createInteractionFixture(1);
  t.after(() => {
    if (path.dirname(data) === path.resolve('.runtime/test-workspaces'))
      fs.rmSync(data, { recursive: true, force: true });
  });
  let creation = createSession(store, {
    kind: 'creation',
    sourceId: p.id,
    resultId: resultA,
    title: 'Creation groups',
  });
  creation = addGroup(store, creation.id, store, p, resultB, 3);
  assert.equal(creation.sourceGroups.length, 1);
  assert.equal(creation.sourceGroups[0].tracks.length, 6);
  const files = creation.sourceGroups[0].tracks.map((track) => track.file);
  for (const file of files) assert.ok(fs.existsSync(store.asset(creation.id, file)));
  const { sourceTracks } = await import('../src/audio/performance.ts');
  const { groupWaveRegion } = await import('../src/audio/performance.ts');
  const extent = groupWaveRegion(
    { ...creation.sourceGroups[0], start: 7200 },
    new Map(creation.sourceGroups[0].tracks.map((track) => [track.id, 180])),
  );
  assert.deepEqual(
    extent,
    { origin: 7200, duration: 180 },
    'late groups render only their own duration',
  );
  assert.equal(sourceTracks(creation).length, 10);
  assert.equal(new Set(sourceTracks(creation).map((track) => track.id)).size, 10);
  creation.tracks[0].solo = true;
  creation = store.save(creation);
  const flattened = sourceTracks(creation);
  assert.equal(flattened.find((track) => track.id === 'drums').mute, true);
  assert.ok(
    flattened
      .filter((track) => track.groupId === creation.sourceGroups[0].id)
      .every((track) => !track.mute),
    'inner listening does not mute another outer object',
  );
  assert.deepEqual(
    creationTracks(creation),
    flattened,
    'offline export uses the same group routing',
  );
  const zip = path.join(data, 'group-project.ijam');
  await pack(store, creation.id, zip, true);
  const received = new Store(path.join(data, 'receiver')),
    restored = await importArchive(received, zip);
  assert.equal(restored.sourceGroups.length, 1);
  for (const file of files)
    assert.deepEqual(
      fs.readFileSync(received.asset(restored.id, file)),
      fs.readFileSync(store.asset(creation.id, file)),
    );
  const broken = structuredClone(creation.sourceGroups);
  broken[0].tracks[0].file = p.original;
  assert.throws(() => store.update(creation.id, { sourceGroups: broken }), /分组/);
  assert.throws(
    () =>
      store.update(creation.id, {
        sourceMix: { gain: 1, mute: false, solo: false, start: 0, tracks: [] },
      }),
    /分组/,
  );
  const audio = path.join(data, 'group-mix.wav');
  await require('../desktop/export-audio.cjs').exportMix(
    store,
    creation.id,
    require('ffmpeg-static'),
    audio,
  );
  assert.ok(require('../desktop/takes.cjs').wavDuration(audio) > 3.9);
});
