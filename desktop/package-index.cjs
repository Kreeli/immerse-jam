const OFFICIAL = 'https://pypi.org/simple/';
const INDEXES = [OFFICIAL, 'https://pypi.tuna.tsinghua.edu.cn/simple/'];
async function selectIndex(fetchIndex = fetch) {
  const results = await Promise.allSettled(
    INDEXES.map(async (url) => {
      const began = performance.now();
      const response = await fetchIndex(url + 'numpy/', { signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('Unavailable package index');
      const reader = response.body.getReader();
      try {
        await reader.read();
      } finally {
        await reader.cancel();
      }
      return { url, elapsed: performance.now() - began };
    }),
  );
  return (
    results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value)
      .sort((a, b) => a.elapsed - b.elapsed)[0]?.url || OFFICIAL
  );
}
async function installPackages(uv, args, env, onEvent, run, choose = selectIndex) {
  const selected = await choose();
  onEvent({ type: 'progress', message: 'Python package index: ' + selected });
  try {
    await run(uv, [...args, '--index-url', selected], env, onEvent);
  } catch (error) {
    if (selected === OFFICIAL) throw error;
    onEvent({ type: 'progress', message: '镜像安装未完成，正在切回 PyPI 官方源…' });
    await run(uv, [...args, '--index-url', OFFICIAL], env, onEvent);
  }
}
module.exports = { selectIndex, installPackages, OFFICIAL };
