const { fetch: fetchNetwork, proxyEnv } = require('./network.cjs');
const OFFICIAL = 'https://pypi.org/simple/';
const MIRROR = 'https://pypi.tuna.tsinghua.edu.cn/simple/';
const INDEXES = [MIRROR, OFFICIAL];
const SAMPLE_BYTES = 512 * 1024;
// Probe the actual pinned Windows wheel, including its CDN, rather than the
// small index page. Bound both time and traffic; never download a full wheel.
async function probe(index, packageName, filename, fetchIndex = fetchNetwork) {
  const signal = AbortSignal.timeout(8000);
  const response = await fetchIndex(index + packageName + '/', { signal });
  if (!response.ok) throw new Error('Unavailable index');
  const page = await response.text();
  const link = [...page.matchAll(/href=["']([^"']+)["']/g)]
    .map((m) => m[1].replaceAll('&amp;', '&'))
    .find((href) => decodeURIComponent(href.split('#')[0]).endsWith(filename));
  if (!link) throw new Error('Pinned wheel absent');
  const began = performance.now();
  const file = await fetchIndex(new URL(link, index).href, {
    headers: { Range: `bytes=0-${SAMPLE_BYTES - 1}` },
    signal,
  });
  if (!file.ok || /text\/html/i.test(file.headers.get('content-type') || ''))
    throw new Error('Wheel unavailable');
  const reader = file.body.getReader();
  let bytes = 0;
  try {
    while (bytes < SAMPLE_BYTES) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.byteLength;
    }
  } finally {
    await reader.cancel();
  }
  if (bytes < 65536) throw new Error('Insufficient probe data');
  return {
    index,
    speed: (Math.min(bytes, SAMPLE_BYTES) * 1000) / Math.max(1, performance.now() - began),
  };
}
async function rankIndexes(indexes, packageName, filename, fetchIndex = fetchNetwork) {
  const results = await Promise.allSettled(
    indexes.map((index) => probe(index, packageName, filename, fetchIndex)),
  );
  const ranked = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => r.value)
    .sort((a, b) => b.speed - a.speed)
    .map((r) => r.index);
  return [...new Set([...ranked, ...(ranked.length ? indexes : [...indexes].reverse())])];
}
async function selectIndex(fetchIndex = fetchNetwork) {
  const ranked = await rankIndexes(
    INDEXES,
    'scipy',
    'scipy-1.16.3-cp311-cp311-win_amd64.whl',
    fetchIndex,
  );
  // If neither source is reachable, retain a clear official fallback.
  return ranked[0];
}
function preferenceOrder(indexes, preference) {
  return preference === 'official' ? [...indexes].reverse() : indexes;
}
async function installFromIndexes(uv, args, env, onEvent, run, indexes) {
  let last;
  for (let i = 0; i < indexes.length; i++) {
    const index = indexes[i];
    onEvent({
      type: 'progress',
      message: i
        ? '当前下载源未完成，正在切换备用源；缓存会继续复用…'
        : '正在下载依赖，首次安装可能需要几分钟…',
    });
    onEvent({ type: 'progress', message: 'Python package index: ' + index });
    try {
      await run(
        uv,
        [...args, '--index-url', index],
        { ...env, ...(await proxyEnv(index)) },
        onEvent,
        { stallMs: 120000, watchDirs: [env.UV_CACHE_DIR, env.TEMP].filter(Boolean) },
      );
      return;
    } catch (error) {
      last = error;
    }
  }
  throw new Error(
    '运行库下载未完成，已尝试镜像和官方源。请检查网络或系统代理后重试，缓存会保留。',
    { cause: last },
  );
}
async function installPackages(
  uv,
  args,
  env,
  onEvent,
  run,
  choose = selectIndex,
  preference = 'auto',
) {
  const selected =
    preference === 'auto' ? await choose() : preference === 'official' ? OFFICIAL : MIRROR;
  return installFromIndexes(uv, args, env, onEvent, run, [
    selected,
    ...INDEXES.filter((x) => x !== selected),
  ]);
}
async function installTorch(uv, args, env, onEvent, run, mode, preference = 'auto') {
  const variant = mode === 'cuda' ? 'cu126' : 'cpu';
  const indexes = [
    `https://mirror.sjtu.edu.cn/pytorch-wheels/${variant}/`,
    `https://download.pytorch.org/whl/${variant}/`,
  ];
  const ranked =
    preference === 'auto'
      ? await rankIndexes(indexes, 'torch', `torch-2.8.0+${variant}-cp311-cp311-win_amd64.whl`)
      : preferenceOrder(indexes, preference);
  return installFromIndexes(uv, args, env, onEvent, run, ranked);
}
module.exports = {
  selectIndex,
  installPackages,
  installTorch,
  rankIndexes,
  probe,
  OFFICIAL,
  MIRROR,
};
