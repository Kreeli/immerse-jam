const { localFailure } = require('./install-errors.cjs');
const fs = require('node:fs'),
  path = require('node:path');
const { fetch: fetchNetwork } = require('./network.cjs');
// The largest ordinary Windows dependencies get the same byte progress and
// partial-file reuse as Torch. Remaining small packages are resolved by uv.
const names = ['llvmlite', 'scipy', 'numpy', 'onnx', 'onnxruntime', 'scikit-learn'];
async function prepare(args, env, onEvent, indexes, services = {}) {
  const constraint = args[args.indexOf('--constraint') + 1];
  const pins = Object.fromEntries(
    fs
      .readFileSync(constraint, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim().split('=='))
      .filter((parts) => parts.length === 2),
  );
  const folder = path.join(env.UV_CACHE_DIR, 'immerse-python-wheels');
  fs.mkdirSync(folder, { recursive: true });
  const fetchIndex = services.fetchIndex || fetchNetwork;
  const download = services.download || require('./runtime.cjs').download;
  const python = args[args.indexOf('--python') + 1];
  const site = path.resolve(path.dirname(python), '../Lib/site-packages');
  for (const name of names) {
    const version = pins[name];
    if (!version) continue;
    const normalized = name.replaceAll('-', '_');
    if (fs.existsSync(path.join(site, `${normalized}-${version}.dist-info/METADATA`))) continue;
    const receipt = path.join(folder, `${normalized}-${version}.json`);
    try {
      const cached = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      if (
        path.basename(cached.file) === cached.file &&
        /^[a-f0-9]{64}$/.test(cached.sha256) &&
        fs.existsSync(path.join(folder, cached.file)) &&
        (await require('./installer-assets.cjs').hash(path.join(folder, cached.file))) ===
          cached.sha256
      )
        continue;
    } catch {}
    let done = false;
    for (const index of indexes) {
      try {
        onEvent({ type: 'progress', file: name, message: '正在准备依赖下载：' + name });
        const base = index + name + '/';
        const response = await fetchIndex(base, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('依赖源不可用');
        const links = [...(await response.text()).matchAll(/href=["']([^"']+)["']/g)];
        for (const link of links) {
          const url = new URL(link[1].replaceAll('&amp;', '&'), base);
          const file = decodeURIComponent(url.pathname.split('/').at(-1));
          if (
            !file.startsWith(`${normalized}-${version}-`) ||
            !/-(?:cp311-cp311|cp3\d-abi3)-win_amd64\.whl$/.test(file)
          )
            continue;
          const hash = new URLSearchParams(url.hash.slice(1)).get('sha256');
          if (url.protocol !== 'https:' || !/^[a-f0-9]{64}$/.test(hash || '')) continue;
          url.hash = '';
          await download(url.href, path.join(folder, file), hash, onEvent);
          require('./store.cjs').atomicJson(receipt, { file, sha256: hash });
          done = true;
          break;
        }
        if (done) break;
      } catch (error) {
        if (localFailure(error)) throw localFailure(error);
      }
    }
    // A mirror can lag one wheel: leave resolution to uv and its fallbacks.
    if (!done)
      onEvent({ type: 'progress', message: '依赖预下载未完成，继续通过备用源安装：' + name });
  }
  return folder;
}
module.exports = { prepare };
