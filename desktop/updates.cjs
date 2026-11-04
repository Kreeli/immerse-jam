const path = require('node:path');
const { fetch: fetchNetwork } = require('./network.cjs');
const { download } = require('./runtime.cjs');
const { hash } = require('./installer-assets.cjs');
const REPOSITORY = 'https://github.com/Kreeli/immerse-jam';
function newer(candidate, current) {
  const a = candidate.replace(/^v/, '').split('.').map(Number),
    b = current.split('.').map(Number);
  if (a.length !== 3 || a.some((n) => !Number.isSafeInteger(n))) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function assetUrl(value, tag) {
  const url = new URL(value);
  if (
    !value.startsWith(`${REPOSITORY}/releases/download/${tag}/`) ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('更新下载地址无效');
  return value;
}
class Updates {
  constructor(base, version, fetch = fetchNetwork, fetchFile = download) {
    this.base = base;
    this.version = version;
    this.fetch = fetch;
    this.fetchFile = fetchFile;
  }
  async check() {
    this.installer = undefined;
    this.release = undefined;
    let last;
    for (const source of [
      'https://api.github.com/repos/Kreeli/immerse-jam/releases/latest',
      'https://kreeli.github.io/immerse-jam/download/releases.json',
    ]) {
      try {
        const response = await this.fetch(source, {
          headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Immerse-Jam' },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        const releases = (Array.isArray(data) ? data : [data]).filter(
          (r) => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name),
        );
        const release = releases.reduce(
          (latest, item) =>
            !latest || newer(item.tag_name, latest.tag_name.slice(1)) ? item : latest,
          null,
        );
        if (!release) throw new Error('No stable release');
        if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name))
          throw new Error('Invalid release');
        const asset = release.assets?.find(
          (a) => a.name === `Immerse.Jam.Setup.${release.tag_name.slice(1)}.exe`,
        );
        const sums = release.assets?.find((a) => a.name === 'SHA256SUMS.txt');
        if (!asset || !sums) throw new Error('Installer missing');
        this.release = { tag: release.tag_name, asset, sums };
        return {
          current: this.version,
          latest: release.tag_name.slice(1),
          available: newer(release.tag_name, this.version),
          size: asset.size,
        };
      } catch (error) {
        last = error;
      }
    }
    throw new Error('暂时无法检查更新，请检查网络或系统代理后重试。', { cause: last });
  }
  async download(onEvent) {
    if (this.downloading) throw new Error('更新正在下载中');
    this.downloading = true;
    this.installer = undefined;
    try {
      if (!this.release) await this.check();
      const { tag, asset, sums } = this.release;
      const response = await this.fetch(assetUrl(sums.browser_download_url, tag), {
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('无法获取更新校验文件');
      const text = await response.text();
      if (text.length > 65536) throw new Error('更新校验文件无效');
      const line = text
        .split(/\r?\n/)
        .map((line) => /^([a-f0-9]{64})\s+\*?(.+)$/.exec(line))
        .find((m) => m?.[2] === asset.name);
      if (!line) throw new Error('更新安装包缺少 SHA-256 校验，已取消下载');
      const file = path.join(this.base, 'updates', asset.name);
      await this.fetchFile(assetUrl(asset.browser_download_url, tag), file, line[1], onEvent);
      if (
        this.release?.tag !== tag ||
        this.release?.asset.browser_download_url !== asset.browser_download_url
      )
        throw new Error('更新版本已变化，请重新下载');
      this.installer = { file, sha256: line[1], tag };
      return true;
    } finally {
      this.downloading = false;
    }
  }
  async verifiedInstaller() {
    if (
      !this.installer ||
      this.installer.tag !== this.release?.tag ||
      (await hash(this.installer.file)) !== this.installer.sha256
    )
      throw new Error('更新安装包未就绪，请重新下载');
    return this.installer.file;
  }
}
module.exports = { Updates, newer, assetUrl };
