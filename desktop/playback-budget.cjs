const fs = require('node:fs'),
  os = require('node:os'),
  { execFile } = require('node:child_process');
const { referencedFiles } = require('../shared/project-validation.cjs');
const cache = new Map();
function decodeBudget(available = os.freemem()) {
  return Math.min(1536 * 1048576, Math.max(0, available * 0.4));
}
async function duration(file, ffmpeg) {
  const stat = fs.statSync(file),
    key = file + ':' + stat.size + ':' + stat.mtimeMs;
  if (cache.has(key)) return cache.get(key);
  const seconds = await new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      ['-nostdin', '-hide_banner', '-i', file],
      { windowsHide: true, timeout: 15000, maxBuffer: 1048576 },
      (_error, _stdout, stderr) => {
        const value = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (!value) reject(new Error('无法读取音频时长，请先转换为 WAV 或 MP3'));
        else resolve(Number(value[1]) * 3600 + Number(value[2]) * 60 + Number(value[3]));
      },
    );
  });
  if (cache.size > 500) cache.clear();
  cache.set(key, seconds);
  return seconds;
}
async function check(store, id, files, ffmpeg) {
  const allowed = new Set(referencedFiles(store.get(id)));
  if (!Array.isArray(files) || files.length > 1000 || files.some((file) => !allowed.has(file)))
    throw new Error('无效的播放文件');
  // Sum the actual current sources, rather than trusting an archive's declared
  // duration. WAV parsing also accepts the empty source of a new creation.
  let bytes = 0;
  for (const relative of files) {
    const file = store.asset(id, relative);
    let seconds;
    try {
      seconds = require('./takes.cjs').wavDuration(file);
    } catch {
      seconds = await duration(file, ffmpeg);
    }
    bytes += seconds * 48000 * 2 * 4;
  }
  if (bytes > decodeBudget())
    throw new Error('当前音轨解码所需内存过多，请裁短音频或减少创作音轨后重试');
  return { bytes };
}
module.exports = { check, decodeBudget };
