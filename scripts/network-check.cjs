// Real Electron transport check; no internet or private library is used.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto'),
  assert = require('node:assert/strict');
const area = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/proxy-'));
const body = Buffer.from('verified model through a proxy');
const requests = [];
const proxy = http.createServer((req, res) => {
  requests.push(req.url);
  res.writeHead(200, { 'Content-Length': body.length });
  res.end(body);
});
let app;
(async () => {
  await new Promise((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const port = proxy.address().port;
  const entry = path.join(area, 'main.cjs');
  fs.writeFileSync(
    entry,
    `const {app,session}=require('electron');
app.setPath('userData',${JSON.stringify(path.join(area, 'profile'))});
app.whenReady().then(async()=>{
 try {
  await session.defaultSession.setProxy({mode:'fixed_servers',proxyRules:'http://127.0.0.1:${port}',proxyBypassRules:'<-loopback>'});
  await require(${JSON.stringify(path.resolve('desktop/runtime.cjs'))}).downloadModel('http://no-dns.immerse.invalid/model',${JSON.stringify(path.join(area, 'model.bin'))},${JSON.stringify(crypto.createHash('sha256').update(body).digest('hex'))});
  globalThis.result=await require(${JSON.stringify(path.resolve('desktop/network.cjs'))}).proxyEnv('https://pypi.org/simple/');
 } catch(error){globalThis.result={error:error.message};}
});`,
  );
  const env = { ...process.env };
  for (const key of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'NO_PROXY',
    'no_proxy',
  ])
    delete env[key];
  app = await electron.launch({ executablePath: require('electron'), args: [entry], env });
  const result = await app.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      if (globalThis.result) return globalThis.result;
      await new Promise((r) => setTimeout(r, 100));
    }
    return { error: 'Timed out' };
  });
  assert.equal(result.error, undefined, JSON.stringify(result));
  assert.equal(result.HTTPS_PROXY, 'http://127.0.0.1:' + port);
  assert.deepEqual(fs.readFileSync(path.join(area, 'model.bin')), body);
  assert.ok(requests.some((url) => url.includes('no-dns.immerse.invalid')));
  console.log('ELECTRON_SYSTEM_PROXY_CHECK_PASSED');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app?.close().catch(() => {});
    proxy.closeAllConnections();
    proxy.close();
  });
