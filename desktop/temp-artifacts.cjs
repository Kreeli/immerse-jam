const fs = require('node:fs'),
  path = require('node:path');
function cleanTransfers(base, now = Date.now()) {
  for (const name of ['transfers', 'incoming-files']) {
    const root = path.resolve(base, name);
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !/^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(entry.name)) continue;
      const file = path.join(root, entry.name);
      if (now - fs.statSync(file).mtimeMs > 24 * 3600000) fs.rmSync(file, { force: true });
    }
  }
}
function pruneJobs(base) {
  const root = path.resolve(base, 'jobs');
  if (!fs.existsSync(root)) return;
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^[a-f0-9-]{36}$/.test(e.name))
    .map((e) => ({
      file: path.join(root, e.name),
      time: fs.statSync(path.join(root, e.name)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  for (let i = 0; i < entries.length; i++)
    if (i >= 20 || Date.now() - entries[i].time > 7 * 86400000) {
      const file = entries[i].file;
      if (path.dirname(file) === root) fs.rmSync(file, { recursive: true, force: true });
    }
}
module.exports = { cleanTransfers, pruneJobs };
