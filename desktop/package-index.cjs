const { localFailure } = require('./install-errors.cjs');
const { fetch: fetchNetwork, proxyEnv, cancelResponse } = require('./network.cjs');
const OFFICIAL = 'https://pypi.org/simple/';
const MIRROR = 'https://mirrors.aliyun.com/pypi/simple/';
const SECOND_MIRROR = 'https://pypi.tuna.tsinghua.edu.cn/simple/';
const INDEXES = [MIRROR, SECOND_MIRROR, OFFICIAL];
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
    cancelResponse(file, reader);
    reader.releaseLock();
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
  // A proxy can make an overseas probe look fastest while the user's direct
  // installation is slow. Auto consistently starts with the domestic mirror.
  return MIRROR;
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
        [...args, '--index-url', index, '--no-config'],
        { ...env, ...(await proxyEnv(index)) },
        onEvent,
        {
          stallMs: 120000,
          watchDirs: [env.UV_CACHE_DIR, env.TEMP].filter(Boolean),
          statusLabel: '正在解析并安装 Python 依赖',
        },
      );
      return;
    } catch (error) {
      if (localFailure(error)) throw localFailure(error);
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
  if (args.some((arg) => /requirements\.txt$/.test(arg))) {
    try {
      await run(uv, [...args, '--offline', '--no-config'], env, () => {}, {
        stallMs: 120000,
        watchDirs: [env.UV_CACHE_DIR, env.TEMP].filter(Boolean),
      });
      onEvent({ type: 'progress', message: '已复用本地依赖缓存' });
      return;
    } catch (error) {
      if (localFailure(error)) throw localFailure(error);
    }
    const folder = await require('./python-wheels.cjs').prepare(args, env, onEvent, [
      selected,
      ...INDEXES.filter((x) => x !== selected),
    ]);
    args = [...args, '--find-links', folder];
  }
  return installFromIndexes(uv, args, env, onEvent, run, [
    selected,
    ...INDEXES.filter((x) => x !== selected),
  ]);
}
async function installTorch(uv, args, env, onEvent, run, mode, preference = 'auto', services) {
  return require('./torch-wheels.cjs').install(
    uv,
    args,
    env,
    onEvent,
    run,
    mode,
    preference,
    services,
  );
}
module.exports = {
  selectIndex,
  installPackages,
  installTorch,
  rankIndexes,
  probe,
  OFFICIAL,
  MIRROR,
  SECOND_MIRROR,
};
