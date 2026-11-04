const { localFailure } = require('./install-errors.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const manifest = require('../shared/installer-assets.json');
async function hash(file) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function copyVerified(source, destination, sha256) {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('资源缺少可信的 SHA-256');
  if ((await hash(source)) !== sha256)
    throw new Error('本地资源校验失败：' + path.basename(source));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp = destination + '.bundled-' + crypto.randomUUID();
  try {
    await fs.promises.copyFile(source, temp);
    if ((await hash(temp)) !== sha256) throw new Error('本地资源复制校验失败');
    await fs.promises.rename(temp, destination);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
function candidates(relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some((part) => part === '..'))
    throw new Error('资源路径无效');
  return [
    process.env.IMMERSE_COMPONENTS_DIR,
    process.resourcesPath && path.join(process.resourcesPath, 'vendor'),
    path.resolve(__dirname, '../release/installer-payload'),
  ]
    .filter(Boolean)
    .map((root) => path.join(root, relative));
}
async function copyBundled(relative, destination, sha256, onEvent) {
  for (const file of candidates(relative)) {
    if (!fs.existsSync(file)) continue;
    onEvent?.({ type: 'progress', file: path.basename(file), message: '正在校验本地安装资源…' });
    try {
      await copyVerified(file, destination, sha256);
      onEvent?.({
        type: 'progress',
        file: path.basename(file),
        progress: 1,
        message: '已从本地安装资源复制',
      });
      return true;
    } catch (error) {
      if (localFailure(error)) throw localFailure(error);
      onEvent?.({ type: 'progress', message: error.message });
    }
  }
  return false;
}
function mirrorUrls(sha256, upstream) {
  const item = manifest.assets.find((item) => item.sha256 === sha256);
  return [
    ...new Set(
      [...(item?.mirrors || []), item?.asset && manifest.baseUrl + item.asset, upstream].filter(
        Boolean,
      ),
    ),
  ];
}
module.exports = { manifest, hash, copyVerified, copyBundled, mirrorUrls };
