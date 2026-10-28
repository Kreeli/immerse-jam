const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { Store } = require('../desktop/store.cjs');
const { Models } = require('../desktop/models.cjs');
const { Jobs } = require('../desktop/jobs.cjs');
const root = path.resolve('.runtime/test-workspaces');
fs.mkdirSync(root, { recursive: true });
const base = fs.mkdtempSync(path.join(root, 'model-results-')),
  store = new Store(base),
  models = new Models(path.resolve('.runtime')),
  ffmpeg = require('ffmpeg-static');
const { createInteractionFixture } = require('./fixtures.cjs');
const generated = createInteractionFixture(8);
const source = generated.store.asset(generated.p.id, generated.p.original),
  clip = path.join(base, 'clip.wav');
const decoded = spawnSync(
  ffmpeg,
  ['-v', 'error', '-y', '-i', source, '-t', '8', '-ac', '2', clip],
  { windowsHide: true },
);
if (decoded.status !== 0) throw Error(String(decoded.stderr));
let p = store.create(clip, '多模型实际分离验收');
async function separate(modelId, mode) {
  const model = models.get(modelId);
  model.directory = path.resolve('.runtime/models', modelId);
  return new Promise((resolve, reject) => {
    const jobs = new Jobs({
      base,
      backend: path.resolve('backend'),
      ffmpeg,
      onEvent: (event) => {
        if (event.type === 'error') reject(new Error(event.message));
        if (event.type === 'complete') resolve(event.result);
        if (event.type === 'progress' && event.progress === 0.15)
          console.log(modelId, event.message);
      },
    });
    jobs.start(
      path.resolve('.runtime/venv/Scripts/python.exe'),
      {
        operation: 'separate',
        directory: store.dir(p.id),
        source: store.asset(p.id, p.original),
        mode,
        model,
      },
      (result) => store.addResult(p.id, result, { modelId, modelName: model.name, mode }),
    );
  });
}
(async () => {
  p = await separate('scnet-small', 'basic');
  const a = p.activeResultId;
  assert.equal(p.tracks.length, 4);
  p = await separate('demucs-6', 'six');
  const b = p.activeResultId;
  assert.equal(p.results.length, 2);
  assert.equal(p.tracks.length, 6);
  assert.equal(store.selectResult(p.id, a).tracks.length, 4);
  assert.equal(store.selectResult(p.id, b).tracks.length, 6);
  for (const result of p.results) {
    assert.ok(fs.existsSync(store.asset(p.id, result.directory + '/result.json')));
    for (const track of result.tracks) {
      assert.ok(track.file.startsWith(result.directory + '/tracks/'));
      assert.ok(fs.statSync(store.asset(p.id, track.file)).size > 1000000);
    }
  }
  console.log(
    'ACTUAL_MULTI_MODEL_RESULTS_PASSED',
    JSON.stringify(
      p.results.map((result) => ({
        model: result.modelId,
        tracks: result.tracks.length,
        directory: result.directory,
      })),
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
