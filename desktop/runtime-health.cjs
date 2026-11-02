const fs = require('node:fs'),
  { execFile } = require('node:child_process');
function createHealth(execute = execFile) {
  const cache = new Map();
  return async function healthy(python, force = false) {
    if (!fs.existsSync(python)) return false;
    const key = python + ':' + fs.statSync(python).mtimeMs,
      existing = cache.get(key);
    if (existing && (existing.pending || (!force && Date.now() - existing.time < 5 * 60 * 1000)))
      return existing.promise;
    const entry = { time: Date.now(), pending: true };
    const promise = new Promise((resolve) =>
      execute(
        python,
        [
          '-c',
          'import torch,librosa,soundfile,pretty_midi; from audio_separator.separator import Separator',
        ],
        { windowsHide: true, timeout: 120000, env: { ...process.env, PYTHONUTF8: '1' } },
        (error) => resolve(!error),
      ),
    );
    entry.promise = promise.then((success) => {
      entry.pending = false;
      entry.time = Date.now();
      if (!success) cache.delete(key);
      return success;
    });
    cache.set(key, entry);
    return entry.promise;
  };
}
module.exports = { healthy: createHealth(), createHealth };
