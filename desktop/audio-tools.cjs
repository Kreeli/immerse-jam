const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  zlib = require('node:zlib');
const { pipeline } = require('node:stream/promises');
const { download } = require('./runtime.cjs');
const TOOL = {
  url: 'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-win32-x64.gz',
  sha256: '04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00',
  license: 'GPL-3.0-or-later',
  source: 'https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1',
};
const pending = new Map();
function audioToolPath(base) {
  return path.join(base, 'tools', 'ffmpeg.exe');
}
async function ensureAudioTools(base, onEvent = () => {}) {
  const destination = audioToolPath(base);
  if (fs.existsSync(destination)) return destination;
  if (pending.has(base)) return pending.get(base);
  const task = (async () => {
    onEvent({ type: 'progress', message: '正在准备音频工具…' });
    const archive = path.join(base, 'tools/ffmpeg.gz'),
      part = destination + '.extracting';
    await download(TOOL.url, archive, null, onEvent);
    try {
      await pipeline(fs.createReadStream(archive), zlib.createGunzip(), fs.createWriteStream(part));
      const hash = crypto.createHash('sha256');
      for await (const data of fs.createReadStream(part)) hash.update(data);
      if (hash.digest('hex') !== TOOL.sha256) throw new Error('下载文件校验失败，请重试');
      fs.renameSync(part, destination);
      fs.writeFileSync(path.join(base, 'tools/ffmpeg.source.json'), JSON.stringify(TOOL, null, 2));
      fs.rmSync(archive, { force: true });
      onEvent({ type: 'ready', message: '音频工具已就绪' });
      return destination;
    } catch (error) {
      fs.rmSync(part, { force: true });
      fs.rmSync(archive, { force: true });
      throw error;
    }
  })();
  pending.set(base, task);
  try {
    return await task;
  } finally {
    pending.delete(base);
  }
}
module.exports = { audioToolPath, ensureAudioTools, TOOL };
