const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fsp = fs.promises;
const DAY = 86400000;
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const signature = (s) => [s.dev, s.ino, s.size, s.mtimeMs, s.ctimeMs].join(':');
const contained = (root, target) => {
  const rel = path.relative(root, target);
  return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
};
async function safePath(root, target) {
  root = path.resolve(root);
  target = path.resolve(target);
  if (!contained(root, target)) return false;
  try {
    if ((await fsp.realpath(root)).toLowerCase() !== root.toLowerCase()) return false;
    const parts = path.relative(root, target).split(path.sep).filter(Boolean);
    let current = root;
    for (const part of ['', ...parts]) {
      if (part) current = path.join(current, part);
      const stat = await fsp.lstat(current);
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) return false;
    }
    return true;
  } catch {
    return false;
  }
}
async function tree(root, limit = 60000) {
  let bytes = 0,
    count = 0,
    complete = true;
  const files = [],
    directories = [];
  const visit = async (file) => {
    if (++count > limit) {
      complete = false;
      return;
    }
    let stat;
    try {
      stat = await fsp.lstat(file);
    } catch (error) {
      if (error.code !== 'ENOENT') complete = false;
      return;
    }
    if (stat.isSymbolicLink()) {
      complete = false;
      return;
    }
    const entry = {
      path: file,
      signature: signature(stat),
      modified: stat.mtimeMs,
      bytes: stat.size,
      linked: stat.isFile() && stat.nlink > 1,
    };
    if (stat.isFile()) {
      bytes += stat.size;
      files.push(entry);
    } else if (stat.isDirectory()) {
      directories.push(entry);
      try {
        for (const child of await fsp.readdir(file)) {
          if (count > limit) break;
          await visit(path.join(file, child));
        }
      } catch {
        complete = false;
      }
    } else complete = false;
  };
  await visit(root);
  return { bytes, files, directories, complete };
}
class SettingsStorage {
  constructor({ library, runtime, profile, logs, isBusy = () => false, now = Date.now }) {
    this.paths = Object.fromEntries(
      Object.entries({ library, runtime, profile, logs }).map(([k, v]) => [k, path.resolve(v)]),
    );
    Object.assign(this.paths, {
      models: path.join(this.paths.runtime, 'models'),
      cache: path.join(this.paths.runtime, 'cache'),
      temp: path.join(this.paths.runtime, 'temp'),
      jobs: path.join(this.paths.runtime, 'jobs'),
    });
    this.isBusy = isBusy;
    this.now = now;
    this.cleaning = false;
    this.previews = new Map();
  }
  async info() {
    const ids = ['library', 'models', 'cache', 'temp', 'jobs', 'profile', 'logs'];
    const rows = await Promise.all(
      ids.map(async (id) => {
        const data = await tree(this.paths[id]);
        return { id, path: this.paths[id], bytes: data.bytes, complete: data.complete };
      }),
    );
    const runtime = await Promise.all(
      ['python', 'venv', 'tools'].map((n) => tree(path.join(this.paths.runtime, n))),
    );
    rows.splice(2, 0, {
      id: 'runtime',
      path: this.paths.runtime,
      bytes: runtime.reduce((n, x) => n + x.bytes, 0),
      complete: runtime.every((x) => x.complete),
    });
    let freeBytes = null;
    try {
      const disk = await fsp.statfs(this.paths.runtime);
      freeBytes = disk.bavail * disk.bsize;
    } catch {}
    return { locations: rows, freeBytes, busy: this.isBusy() || this.cleaning };
  }
  async candidates(category) {
    if (!['temp', 'jobs'].includes(category)) throw new Error('此类别不支持清理');
    const root = this.paths[category],
      age = category === 'temp' ? DAY : 7 * DAY;
    if (!(await safePath(root, root))) return [];
    const result = [];
    for (const name of await fsp.readdir(root)) {
      if (category === 'jobs' && !UUID.test(name)) continue;
      const target = path.join(root, name);
      const data = await tree(target);
      if (!data.complete || !data.files.length || data.files.some((file) => file.linked)) continue;
      const entries = [...data.files, ...data.directories];
      if (
        entries.some(
          (f) =>
            this.now() - f.modified < age ||
            /(?:\.parts?(?:\.|$)|resume|download|\.lock$)/i.test(path.basename(f.path)),
        )
      )
        continue;
      if (category === 'jobs') {
        if (
          data.directories.length !== 1 ||
          data.files.some((f) => !['request.json', 'worker.log'].includes(path.basename(f.path)))
        )
          continue;
        try {
          const request = JSON.parse(await fsp.readFile(path.join(target, 'request.json'), 'utf8'));
          if (!['separate', 'analyze', 'align'].includes(request.operation)) continue;
        } catch {
          continue;
        }
      }
      if (!(await safePath(root, target))) continue;
      result.push({ root, target, ...data });
    }
    return result;
  }
  async preview(category) {
    if (this.isBusy() || this.cleaning) throw new Error('请等待录音、下载和处理任务结束后再清理');
    for (const [id, p] of this.previews) if (p.expires < this.now()) this.previews.delete(id);
    if (this.previews.size >= 8) this.previews.delete(this.previews.keys().next().value);
    const candidates = await this.candidates(category),
      token = crypto.randomUUID();
    const value = { category, candidates, expires: this.now() + 5 * 60000 };
    this.previews.set(token, value);
    return {
      token,
      category,
      expires: value.expires,
      files: candidates.reduce((n, x) => n + x.files.length, 0),
      bytes: candidates.reduce((n, x) => n + x.bytes, 0),
    };
  }
  async clear(token) {
    const snapshot = this.previews.get(token);
    if (!snapshot || snapshot.expires < this.now()) throw new Error('清理预览已过期，请重新扫描');
    if (this.isBusy() || this.cleaning) throw new Error('请等待录音、下载和处理任务结束后再清理');
    this.previews.delete(token);
    this.cleaning = true;
    const result = { deletedFiles: 0, freedBytes: 0, skippedFiles: 0, failedFiles: 0 };
    try {
      for (const candidate of snapshot.candidates) {
        let valid = !this.isBusy();
        for (const entry of [...candidate.directories, ...candidate.files]) {
          if (!valid) break;
          try {
            valid =
              (await safePath(candidate.root, entry.path)) &&
              signature(await fsp.lstat(entry.path)) === entry.signature;
          } catch {
            valid = false;
          }
        }
        if (!valid) {
          result.skippedFiles += candidate.files.length;
          continue;
        }
        for (const entry of candidate.files) {
          try {
            if (
              this.isBusy() ||
              !(await safePath(candidate.root, entry.path)) ||
              signature(await fsp.lstat(entry.path)) !== entry.signature
            ) {
              result.skippedFiles++;
              continue;
            }
            await fsp.unlink(entry.path);
            result.deletedFiles++;
            result.freedBytes += entry.bytes;
          } catch {
            result.failedFiles++;
          }
        }
        // Never recursively remove a directory: new or unrecognized files survive.
        for (const directory of [...candidate.directories].reverse()) {
          try {
            if (await safePath(candidate.root, directory.path)) await fsp.rmdir(directory.path);
          } catch {}
        }
      }
      return result;
    } finally {
      this.cleaning = false;
    }
  }
  async location(id) {
    if (!Object.hasOwn(this.paths, id)) throw new Error('无效存储位置');
    const location = this.paths[id];
    if (!fs.existsSync(location)) throw new Error('该位置尚未创建');
    return location;
  }
}
module.exports = { SettingsStorage };
