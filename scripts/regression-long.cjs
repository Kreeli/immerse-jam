const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { Store } = require('../desktop/store.cjs');
const { Models } = require('../desktop/models.cjs');
const root = process.cwd();
const store = new Store(path.resolve('.runtime/data'));
const song = store.get(
  process.env.TEST_PROJECT_ID ||
    (() => {
      throw new Error('Set TEST_PROJECT_ID to a local project you want to benchmark');
    })(),
);
const directory = path.resolve('.runtime/regression-long');
fs.mkdirSync(directory, { recursive: true });
const model = new Models(path.resolve('.runtime')).get('roformer-sw');
model.directory = path.resolve('.runtime/models/roformer-sw');
const request = {
  operation: 'separate',
  mode: 'six',
  directory,
  source: store.asset(song.id, song.original),
  model,
};
const requestFile = path.join(directory, 'request.json');
fs.writeFileSync(requestFile, JSON.stringify(request));
const ffmpeg = require('ffmpeg-static');
const child = spawn(
  path.resolve('.runtime/venv/Scripts/python.exe'),
  ['-u', path.resolve('backend/worker.py'), requestFile],
  {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUTF8: '1',
      IMMERSE_FFMPEG: ffmpeg,
      PATH: path.dirname(ffmpeg) + path.delimiter + process.env.SystemRoot + '\\System32',
    },
  },
);
let result,
  pending = '';
child.stdout.on('data', (chunk) => {
  const text = chunk.toString();
  fs.appendFileSync(path.join(directory, 'result.jsonl'), text);
  pending += text;
  let index;
  while ((index = pending.indexOf('\n')) >= 0) {
    const line = pending.slice(0, index);
    pending = pending.slice(index + 1);
    try {
      const event = JSON.parse(line);
      if (event.type === 'result') result = event.result;
      else console.log(line);
    } catch {}
  }
});
child.stderr.on('data', (chunk) => fs.appendFileSync(path.join(directory, 'worker.log'), chunk));
child.on('close', (code) => {
  try {
    assert.equal(code, 0);
    assert.equal(result.tracks.length, 6);
    assert.ok(result.separation.peakCudaAllocatedMB > 0);
    console.log('LONG_SONG_GPU_PASSED', JSON.stringify(result.separation));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
});
child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
