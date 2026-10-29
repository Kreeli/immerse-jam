const fs = require('node:fs'),
  { execFile } = require('node:child_process');
const cache = new Map();
async function healthy(python, force = false) {
  if (!fs.existsSync(python)) return false;
  const key = python + ':' + fs.statSync(python).mtimeMs,
    existing = cache.get(key);
  if (!force && existing && Date.now() - existing.time < 5 * 60 * 1000) return existing.promise;
  const promise = new Promise((resolve) =>
    execFile(
      python,
      [
        '-c',
        'import torch,librosa,soundfile,pretty_midi; from audio_separator.separator import Separator',
      ],
      { windowsHide: true, timeout: 30000, env: { ...process.env, PYTHONUTF8: '1' } },
      (error) => resolve(!error),
    ),
  );
  cache.set(key, { time: Date.now(), promise });
  return promise;
}
module.exports = { healthy };
