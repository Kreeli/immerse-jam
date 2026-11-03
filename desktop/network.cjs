const responseControllers = new WeakMap();
// Chromium inherits Windows proxy settings; Node fetch does not. CLI/tests
// retain the Node transport, while both Electron installation paths use this.
function createNetwork(electron, env = process.env) {
  let configured;
  async function session() {
    if (!electron) return null;
    await electron.app.whenReady();
    const explicit = env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy;
    if (!explicit) return electron.session.defaultSession;
    if (!configured)
      configured = (async () => {
        const target = electron.session.fromPartition('immerse-downloads');
        const proxy = new URL(explicit);
        if (!['http:', 'https:', 'socks5:'].includes(proxy.protocol))
          throw new Error('代理地址不受支持，请使用 HTTP、HTTPS 或 SOCKS5 代理。');
        await target.setProxy({
          mode: 'fixed_servers',
          proxyRules: `${proxy.protocol}//${proxy.host}`,
          proxyBypassRules: env.NO_PROXY || env.no_proxy || '<local>',
        });
        if (proxy.username || proxy.password)
          electron.app.on('login', (event, _webContents, _details, info, callback) => {
            if (
              !info.isProxy ||
              info.host !== proxy.hostname ||
              String(info.port) !== (proxy.port || '80')
            )
              return;
            event.preventDefault();
            callback(decodeURIComponent(proxy.username), decodeURIComponent(proxy.password));
          });
        return target;
      })();
    return configured;
  }
  return {
    async fetch(url, options = {}) {
      const target = await session();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      const signal = AbortSignal.any([
        controller.signal,
        ...(options.signal ? [options.signal] : []),
      ]);
      try {
        const response = await (target
          ? target.fetch(url, { ...options, signal })
          : globalThis.fetch(url, { ...options, signal }));
        responseControllers.set(response, controller);
        return response;
      } finally {
        clearTimeout(timer);
      }
    },
    async proxyEnv(url) {
      if (env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy) return {};
      const target = await session();
      if (!target) return {};
      const route = await target.resolveProxy(url);
      const first = route.split(';')[0].trim();
      const match = /^(PROXY|HTTPS|SOCKS5?)\s+(.+)$/i.exec(first);
      if (!match) return {};
      const scheme = match[1] === 'HTTPS' ? 'https' : /^SOCKS/.test(match[1]) ? 'socks5' : 'http';
      return { HTTPS_PROXY: `${scheme}://${match[2]}`, HTTP_PROXY: `${scheme}://${match[2]}` };
    },
  };
}
const network = createNetwork(process.versions.electron ? require('electron') : null);
async function* chunks(response, idleMs = 45000) {
  const reader = response.body.getReader();
  try {
    for (;;) {
      let timer;
      try {
        const result = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('下载长时间没有进展，请重试；已下载的部分会保留。')),
              idleMs,
            );
          }),
        ]);
        if (result.done) return;
        yield result.value;
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    responseControllers.get(response)?.abort();
    responseControllers.delete(response);
    // Some transports never settle cancel() on a broken connection. Cleanup
    // must not prevent the idle timeout from reaching retry/error handling.
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function downloadError(error) {
  if (/ENOSPC/.test(error.message))
    return new Error('磁盘空间不足，请腾出空间后重试。', { cause: error });
  if (/EACCES|EPERM/.test(error.message))
    return new Error('无法写入下载目录，请检查文件夹权限后重试。', { cause: error });
  if (/校验|分块|文件大小|代理地址/.test(error.message)) return error;
  return new Error(
    '下载未完成，请检查网络或系统代理后重试。已下载的部分会保留，也可在设置中导入本地模型。',
    { cause: error },
  );
}
module.exports = { ...network, chunks, downloadError, createNetwork };
