const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { createInteractionFixture } = require('../scripts/fixtures.cjs');
const { createSession } = require('../desktop/sessions.cjs');
test('practice and sourced creation copy selected stems independently and leave no project on failure', async (t) => {
  const { data, store, p, resultA, resultB } = createInteractionFixture(1);
  t.after(() => {
    if (path.dirname(data) === path.resolve('.runtime/test-workspaces'))
      fs.rmSync(data, { recursive: true, force: true });
  });
  const original = fs.readFileSync(path.join(store.dir(p.id), 'project.json'));
  const session = createSession(store, {
    kind: 'practice',
    sourceId: p.id,
    resultId: resultB,
    title: 'My practice',
    mode: 'mixed',
  });
  assert.equal(session.kind, 'practice');
  assert.equal(session.practiceMode, 'mixed');
  assert.equal(session.tracks.length, 6);
  assert.equal(session.results.length, 1);
  assert.deepEqual(session.takes, []);
  for (const file of [session.original, ...session.tracks.map((track) => track.file)])
    assert.deepEqual(
      fs.readFileSync(store.asset(session.id, file)),
      fs.readFileSync(store.asset(p.id, file)),
    );
  store.update(session.id, {
    tracks: session.tracks.map((track) => ({ ...track, gain: 0.3 })),
    practiceMode: 'instrument',
  });
  assert.deepEqual(fs.readFileSync(path.join(store.dir(p.id), 'project.json')), original);
  const creation = createSession(store, {
    kind: 'creation',
    sourceId: p.id,
    resultId: resultA,
    title: 'Layered',
  });
  const { sourceTracks, playbackTracks } = await import('../src/audio/performance.ts');
  assert.equal(sourceTracks(creation).length, 4);
  const blank = createSession(store, { kind: 'creation', title: 'Empty' });
  assert.equal(sourceTracks(blank).length, 0);
  const count = store.list().length;
  assert.throws(() => createSession(store, { kind: 'practice', title: 'No source' }), /已分轨/);
  assert.throws(
    () => createSession(store, { kind: 'creation', sourceId: p.id, title: '', mode: 'instrument' }),
    /名称/,
  );
  assert.equal(store.list().length, count);
  const broken = structuredClone(p);
  broken.id = require('node:crypto').randomUUID();
  broken.tracks = [{ ...p.tracks[0], file: 'missing.wav' }];
  broken.results = [{ ...p.results[0], id: 'broken', tracks: broken.tracks }];
  broken.activeResultId = 'broken';
  store.save(broken);
  const before = fs.readdirSync(store.projects).length;
  assert.throws(() =>
    createSession(store, { kind: 'practice', sourceId: broken.id, title: 'Failed copy' }),
  );
  assert.equal(fs.readdirSync(store.projects).length, before);
  const take = {
    id: 'take',
    file: 'take.wav',
    name: 'Take',
    start: 0,
    duration: 1,
    offsetMs: 0,
    gain: 1,
    pan: 0,
    mute: false,
    solo: false,
  };
  const review = { ...session, practiceMode: 'mixed', takes: [take], selectedTakeIds: ['take'] };
  const mixed = playbackTracks(review);
  assert.ok(mixed.filter((track) => track.id !== 'take').every((track) => track.mute));
  assert.equal(mixed.find((track) => track.id === 'take').mute, false);
  const capturing = playbackTracks(review, true);
  assert.ok(capturing.filter((track) => track.id !== 'take').every((track) => !track.mute));
  assert.equal(capturing.find((track) => track.id === 'take').mute, true);
  assert.ok(
    playbackTracks({ ...review, practiceMode: 'instrument' }).every((track) => !track.mute),
  );
});
