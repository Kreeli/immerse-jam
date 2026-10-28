const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Store } = require('../desktop/store.cjs');
const { pack, importArchive } = require('../desktop/archive.cjs');
function fixture(t) {
  const root = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(root, { recursive: true });
  const folder = fs.mkdtempSync(path.join(root, 'results-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
function tracks(store, id, names, folder = 'work-fixture') {
  return names.map((name) => {
    const file = folder + '/' + name + '.wav';
    const absolute = store.asset(id, file);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, Buffer.alloc(1024, 9));
    return { id: name, name, file, gain: 1, pan: 0, mute: false, solo: false };
  });
}
test('independent four- and six-track results survive switching, rename and archive transfer', async (t) => {
  const root = fixture(t),
    store = new Store(path.join(root, 'a')),
    other = new Store(path.join(root, 'b')),
    original = path.join(root, 'original.wav');
  fs.writeFileSync(original, Buffer.from('original audio'));
  let p = store.create(original);
  p = store.addResult(
    p.id,
    { tracks: tracks(store, p.id, ['vocals', 'drums', 'bass', 'other']) },
    { modelId: 'A', modelName: '模型 A', mode: 'basic' },
  );
  const a = p.activeResultId;
  p = store.addResult(
    p.id,
    {
      tracks: tracks(
        store,
        p.id,
        ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'],
        '.work/' + crypto.randomUUID(),
      ),
    },
    { modelId: 'B', modelName: '模型 B', mode: 'six' },
  );
  const b = p.activeResultId;
  assert.equal(p.results.length, 2);
  assert.equal(p.tracks.length, 6);
  p = store.selectResult(p.id, a);
  assert.equal(p.tracks.length, 4);
  p.tracks[0].gain = 0.3;
  store.update(p.id, { tracks: p.tracks, activeResultId: a });
  p = store.selectResult(p.id, b);
  assert.equal(p.tracks[0].gain, 1);
  p = store.selectResult(p.id, a);
  assert.equal(p.tracks[0].gain, 0.3);
  const old = p.results[0].directory;
  p = store.renameResult(p.id, a, '我的四轨结果');
  assert.notEqual(p.results[0].directory, old);
  assert.ok(fs.existsSync(store.asset(p.id, p.tracks[0].file)));
  assert.ok(fs.existsSync(store.asset(p.id, p.results[0].directory + '/result.json')));
  const { createChart } = await import('../src/features/chords/chart.ts');
  const chart = createChart(undefined, 8, true, 'custom');
  chart.bars[0].slots[0].label = 'G7';
  chart.bars[1].slots = [];
  p = store.update(p.id, { chordCharts: [chart], activeChordChartId: 'custom' });
  const zip = path.join(root, 'song.ijam');
  await pack(store, p.id, zip, true);
  const imported = await importArchive(other, zip);
  assert.equal(imported.results.length, 2);
  assert.equal(imported.chordCharts[0].bars[0].slots[0].label, 'G7');
  assert.equal(imported.chordCharts[0].bars[1].slots.length, 0);
  assert.equal(imported.results[0].name, '我的四轨结果');
  assert.equal(imported.results[1].tracks.length, 6);
  for (const result of imported.results)
    for (const track of result.tracks)
      assert.ok(fs.existsSync(other.asset(imported.id, track.file)));
  assert.equal(store.selectResult(p.id, null).tracks.length, 0);
  assert.equal(store.get(p.id).results.length, 2);
});
test('old active stems and complete historical results migrate without changing old media', (t) => {
  const root = fixture(t),
    store = new Store(root),
    source = path.join(root, 'source.mp3');
  fs.writeFileSync(source, Buffer.from('original'));
  let p = store.create(source);
  const current = tracks(store, p.id, ['vocals', 'drums', 'bass', 'other'], 'assets');
  const old = tracks(
    store,
    p.id,
    ['vocals', 'drums', 'bass', 'other', 'guitar', 'piano'],
    'separations/' + crypto.randomUUID(),
  );
  const sourceBytes = fs.readFileSync(store.asset(p.id, current[0].file));
  p.tracks = current;
  delete p.results;
  delete p.activeResultId;
  fs.writeFileSync(path.join(store.dir(p.id), 'project.json'), JSON.stringify(p));
  const upgraded = store.get(p.id);
  assert.equal(upgraded.results.length, 2);
  assert.equal(upgraded.tracks.length, 4);
  assert.ok(upgraded.tracks[0].file.startsWith('results/'));
  assert.deepEqual(fs.readFileSync(store.asset(p.id, current[0].file)), sourceBytes);
  assert.ok(fs.existsSync(store.asset(p.id, old[0].file)));
  assert.ok(fs.existsSync(path.join(store.dir(p.id), 'project.before-results.json')));
  assert.equal(store.get(p.id).results.length, 2);
});
test('a chart containing three chords in a measure cannot be committed', (t) => {
  const root = fixture(t),
    store = new Store(root),
    source = path.join(root, 'source.mp3');
  fs.writeFileSync(source, 'audio');
  const p = store.create(source);
  assert.throws(() =>
    store.update(p.id, {
      chordCharts: [
        {
          id: 'score',
          meter: 4,
          bars: [
            {
              id: 'bar',
              start: 0,
              end: 2,
              slots: [0, 1, 2].map((i) => ({ id: String(i), label: 'C' })),
            },
          ],
        },
      ],
    }),
  );
  assert.equal(store.get(p.id).chordCharts, undefined);
});
