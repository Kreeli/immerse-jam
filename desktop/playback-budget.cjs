const fs = require('node:fs'),
  os = require('node:os'),
  { execFile } = require('node:child_process');
const { referencedFiles } = require('../shared/project-validation.cjs');
const cache = new Map();
function decodeBudget(available = os.freemem(), total = os.totalmem()) {
  // Free RAM excludes reclaimable OS cache and the previous WebAudio buffers.
  // Desktop has virtual memory: a transient low free-memory reading must not
  // reject a song which comfortably fits this machine's normal audio budget.
  return Math.max(0, Math.min(8 * 1024 ** 3, total * 0.5, Math.max(total * 0.25, available * 0.6)));
}
async function mediaInfo(file, ffmpeg) {
  try {
    return require('./takes.cjs').wavInfo(file);
  } catch {
    // Compressed sources need the decoder to identify the channel count.
  }
  const stat = fs.statSync(file),
    key = file + ':' + stat.size + ':' + stat.mtimeMs;
  if (cache.has(key)) return cache.get(key);
  const info = await new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      [
        '-nostdin',
        '-hide_banner',
        '-nostats',
        '-i',
        file,
        '-map',
        '0:a:0',
        '-af',
        'ashowinfo',
        '-frames:a',
        '1',
        '-f',
        'null',
        '-',
      ],
      { windowsHide: true, timeout: 15000, maxBuffer: 1048576 },
      (error, _stdout, stderr) => {
        const value = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        const channels = Number(
          stderr.match(/\[Parsed_ashowinfo_[^\]]*\][^\r\n]*\bchannels:(\d+)/)?.[1],
        );
        if (error || !value || !channels)
          reject(new Error('无法读取音频时长，请先转换为 WAV 或 MP3'));
        else
          resolve({
            seconds: Number(value[1]) * 3600 + Number(value[2]) * 60 + Number(value[3]),
            channels,
          });
      },
    );
  });
  if (cache.size > 500) cache.clear();
  cache.set(key, info);
  return info;
}
async function check(store, id, files, ffmpeg, sampleRate = 48000) {
  if (![44100, 48000, 88200, 96000].includes(sampleRate)) throw new Error('无效的播放采样率');
  const allowed = new Set(referencedFiles(store.get(id)));
  if (!Array.isArray(files) || files.length > 1000 || files.some((file) => !allowed.has(file)))
    throw new Error('无效的播放文件');
  // Sum the actual current sources, rather than trusting an archive's declared
  // duration. WAV parsing also accepts the empty source of a new creation.
  let bytes = 0;
  for (const relative of files) {
    const file = store.asset(id, relative);
    const { seconds, channels } = await mediaInfo(file, ffmpeg);
    bytes += Math.ceil(seconds * sampleRate) * channels * Float32Array.BYTES_PER_ELEMENT;
  }
  if (bytes > decodeBudget())
    throw new Error('当前音轨解码所需内存过多，请裁短音频或减少创作音轨后重试');
  return { bytes };
}
module.exports = { check, decodeBudget, mediaInfo };
