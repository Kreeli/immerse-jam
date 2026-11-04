const { localFailure } = require('./install-errors.cjs');
const path = require('node:path');
const pins = require('../shared/torch-wheels.json');
const { fetch: fetchNetwork } = require('./network.cjs');

// Windows CPython 3.11 wheels, SHA-256 pinned from the official PyTorch index.
// Download outside uv so multi-GB wheels have byte progress and resumable files.
async function mirrorWheel(index, item, filename, fetchIndex) {
  const page = await fetchIndex(index + item.name + '/', { signal: AbortSignal.timeout(8000) });
  if (!page.ok) throw new Error('运行库镜像不可用');
  for (const match of (await page.text()).matchAll(/href=["']([^"']+)["']/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), index + item.name + '/');
    if (
      url.protocol !== 'https:' ||
      decodeURIComponent(url.pathname.split('/').at(-1)) !== filename
    )
      continue;
    const hash = new URLSearchParams(url.hash.slice(1)).get('sha256');
    if (hash && hash !== item.sha256) continue;
    url.hash = '';
    return url.href;
  }
  throw new Error('镜像未提供对应的运行库文件');
}
async function install(uv, args, env, onEvent, run, mode, preference, services = {}) {
  const variant = mode === 'cuda' ? 'cu126' : 'cpu';
  const items = pins[variant];
  const pinnedArgs = args.map((arg) => {
    const item = items.find((item) => arg === `${item.name}==${item.version}`);
    return item ? `${arg}+${variant}` : arg;
  });
  const options = { stallMs: 120000, watchDirs: [env.UV_CACHE_DIR, env.TEMP].filter(Boolean) };
  onEvent({ type: 'progress', message: '正在检查已有运行库和本地缓存…' });
  try {
    // Reuse installed wheels or uv's earlier cache before making any requests.
    await run(uv, [...pinnedArgs, '--offline', '--no-deps'], env, () => {}, options);
    onEvent({ type: 'progress', message: '已复用本地运行库，继续准备其他依赖…' });
    return;
  } catch (error) {
    if (localFailure(error)) throw localFailure(error);
  }
  const download = services.download || require('./runtime.cjs').download;
  const fetchIndex = services.fetchIndex || fetchNetwork;
  const folder = path.join(env.UV_CACHE_DIR, 'immerse-wheels', variant);
  const files = [];
  for (const item of items) {
    const filename = `${item.name}-${item.version}+${variant}-cp311-cp311-win_amd64.whl`;
    const destination = path.join(folder, filename);
    const official = `https://download.pytorch.org/whl/${variant}/${encodeURIComponent(filename)}`;
    // Probe only the small mirror index. Never spend bandwidth speed-testing a
    // giant wheel. Every source must satisfy the same pinned full-file digest.
    const sources = preference === 'official' ? ['official', 'mirror'] : ['mirror', 'official'];
    let last;
    for (const source of sources) {
      try {
        onEvent({ type: 'progress', file: filename, message: '正在准备运行库下载…' });
        const url =
          source === 'official'
            ? official
            : await mirrorWheel(
                `https://mirror.sjtu.edu.cn/pytorch-wheels/${variant}/`,
                item,
                filename,
                fetchIndex,
              );
        await download(url, destination, item.sha256, onEvent);
        last = undefined;
        break;
      } catch (error) {
        if (localFailure(error)) throw localFailure(error);
        last = error;
        onEvent({
          type: 'progress',
          file: filename,
          message: '当前运行库源未完成，正在切换备用源；已下载部分保留…',
        });
      }
    }
    if (last)
      throw new Error('运行库下载未完成，请从断点重试；已下载的部分会保留。', { cause: last });
    files.push(destination);
  }
  onEvent({ type: 'progress', message: '下载已完成，正在解压并安装运行库…' });
  const localArgs = args.filter(
    (arg) => !items.some((item) => arg === `${item.name}==${item.version}`),
  );
  // Ordinary dependencies (Pillow, NumPy, etc.) are resolved in the following
  // installPackages step, with the project's constraints and general PyPI index.
  await run(uv, [...localArgs, ...files, '--offline', '--no-deps'], env, onEvent, options);
}
module.exports = { install, mirrorWheel };
