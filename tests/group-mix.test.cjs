const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { createInteractionFixture } = require('../scripts/fixtures.cjs');
const { createSession } = require('../desktop/sessions.cjs');
const { addGroup, creationTracks } = require('../desktop/groups.cjs');

test('Android discards a superseded waveform but still consumes its native task', async (t) => {
  const oldWindow = globalThis.window,
    oldFetch = globalThis.fetch;
  let current = true,
    reads = 0;
  globalThis.window = {
    jam: {
      call: async (method) => {
        if (method === 'android-stream-open') return { id: 'fixture', tracks: [] };
        assert.equal(method, 'android-stream-wave');
        current = false;
        return { url: '/fixture-wave' };
      },
    },
  };
  globalThis.fetch = async (url) => {
    assert.equal(url, '/fixture-wave');
    reads++;
    return new Response(new Float32Array([0.2, 0.4]).buffer);
  };
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    globalThis.fetch = oldFetch;
  });
  const ts = require('typescript');
  const compiled = ts.transpileModule(
    fs.readFileSync('src/platform/android/StreamingAudio.ts', 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
  const { StreamingAudio } = await import(
    'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
  );
  const audio = await StreamingAudio.open({ id: 'fixture' }, []);
  assert.deepEqual(await audio.envelope([], 0, 1, 1, () => current), []);
  assert.equal(reads, 1, 'native wave request is consumed instead of leaked');
});

test('group and stem pan combine without changing stem settings, persist, and agree with export', async (t) => {
  const { store, p, data, resultB } = createInteractionFixture(1);
  t.after(() => {
    assert.equal(path.dirname(data), path.resolve('.runtime/test-workspaces'));
    fs.rmSync(data, { recursive: true, force: true });
  });
  const { sourceTracks } = await import('../src/audio/performance.ts');
  let project = createSession(store, {
    kind: 'creation',
    title: 'Pan fixture',
    sourceId: p.id,
    resultId: resultB,
  });
  project = addGroup(store, project.id, store, p, resultB);
  project.sourceMix = { gain: 0.6, pan: -0.4, mute: false, solo: false, start: 0 };
  project.tracks[0].pan = 0.15;
  project.sourceGroups[0].pan = 0.7;
  project.sourceGroups[0].gain = 0.5;
  project.sourceGroups[0].tracks[0].pan = 0.6;
  project.sourceGroups[0].tracks[1].pan = -0.9;
  const saved = store.save(project),
    read = store.get(project.id),
    tracks = sourceTracks(read);
  assert.deepEqual(tracks, creationTracks(read));
  assert.equal(tracks[0].pan, -0.25);
  const imported = tracks.filter((track) => track.groupId === saved.sourceGroups[0].id);
  assert.equal(imported[0].pan, 1);
  assert.ok(Math.abs(imported[1].pan + 0.2) < 1e-12);
  assert.equal(imported[0].gain, 0.5);
  assert.equal(read.sourceGroups[0].tracks[0].pan, 0.6);
  assert.equal(read.sourceMix.pan, -0.4);
  assert.equal(read.sourceGroups[0].pan, 0.7);
  const invalid = structuredClone(read);
  invalid.sourceGroups[0].pan = 1.01;
  assert.throws(() => store.save(invalid));
  delete read.sourceMix.pan;
  delete read.sourceGroups[0].pan;
  const legacy = store.save(read);
  assert.deepEqual(sourceTracks(legacy), creationTracks(legacy));
  assert.equal(sourceTracks(legacy)[0].pan, 0.15);
});
