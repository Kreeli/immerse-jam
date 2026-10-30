// Opt-in local simulator acceptance of the real HTTP route and embedded scanner.
const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  crypto = require('node:crypto'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { Store } = require('../desktop/store.cjs'),
  { importArchive } = require('../desktop/archive.cjs'),
  { Transfer } = require('../desktop/transfer.cjs');
const adb =
    JSON.parse(fs.readFileSync('.runtime/android/config.json')).sdk + '/platform-tools/adb.exe',
  cmd = (...args) => cp.execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
let browser, server, slow;
(async () => {
  const data = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/android-lan-')),
    store = new Store(data),
    source = await importArchive(
      store,
      path.resolve('.runtime/android/device-fixtures/source.ijam'),
    );
  source.originId = crypto.randomUUID();
  source.title = 'Android LAN 验收 ' + Date.now();
  store.save(source);
  const incoming = [];
  server = new Transfer(store, (e) => incoming.push(e));
  const pair = await server.start([source.id]);
  const url = new URL(pair.url);
  url.hostname = '10.0.2.2';
  cmd('shell', 'am', 'start', '-n', 'app.immersejam.mobile/.MainActivity');
  const pid = cmd('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
  cmd('forward', 'tcp:9222', 'localabstract:webview_devtools_remote_' + pid);
  for (let i = 0; i < 30; i++) {
    try {
      browser = await chromium.connectOverCDP('http://127.0.0.1:9222', { noDefaults: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  assert.ok(browser);
  const page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes('/app/'));
  await page.waitForFunction(() => window.jam);
  let scanner = 'not requested';
  if (process.argv.includes('--scanner')) {
    cmd('shell', 'pm', 'grant', 'app.immersejam.mobile', 'android.permission.CAMERA');
    const scanned = page.evaluate(() => window.jam.call('android-scan-pair'));
    try {
      let opened = false;
      for (let i = 0; i < 30; i++) {
        if (
          cmd('shell', 'dumpsys', 'activity', 'activities').includes(
            'topResumedActivity=ActivityRecord',
          ) &&
          cmd('shell', 'dumpsys', 'activity', 'activities')
            .split('\n')
            .some(
              (line) => line.includes('topResumedActivity=') && line.includes('CaptureActivity'),
            )
        ) {
          opened = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert.ok(opened, 'Native camera scanner opened');
    } finally {
      cmd('shell', 'input', 'keyevent', '4');
    }
    assert.equal(await scanned, '');
    scanner = 'native camera opened and cancelled; decoding not exercised';
  }
  const list = await page.evaluate((url) => window.jam.call('android-lan-list', { url }), url.href);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, source.id);
  const [received] = await page.evaluate(
    ({ url, id }) => window.jam.call('android-lan-download', { url, ids: [id] }),
    { url: url.href, id: source.id },
  );
  assert.deepEqual(received.analysis.beats, source.analysis.beats);
  assert.deepEqual(received.analysis.downbeats, source.analysis.downbeats);
  assert.equal(received.analysis.bpm, source.analysis.bpm);
  const original = await page.evaluate(async () =>
    (await window.jam.call('library')).find((p) => p.title === 'Android 节拍与对齐验收'),
  );
  await page.evaluate(({ url, id }) => window.jam.call('android-lan-upload', { url, ids: [id] }), {
    url: url.href,
    id: original.id,
  });
  assert.equal(incoming.length, 1);
  const item = server.pending.get(incoming[0].id);
  assert.ok(item);
  const imported = await importArchive(store, item.file);
  assert.deepEqual(imported.analysis.beats, original.analysis.beats);
  assert.deepEqual(imported.alignment, original.alignment);
  let refused = false;
  try {
    await page.evaluate(() =>
      window.jam.call('android-lan-list', { url: 'http://8.8.8.8/?token=' + 'a'.repeat(48) }),
    );
  } catch {
    refused = true;
  }
  assert.ok(refused);
  let requested;
  const started = new Promise((resolve) => (requested = resolve));
  slow = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.write('[');
    requested();
  });
  await new Promise((resolve) => slow.listen(0, '0.0.0.0', resolve));
  const stalled = page.evaluate(
    (url) => window.jam.call('android-lan-list', { url }),
    'http://10.0.2.2:' + slow.address().port + '/?token=' + 'a'.repeat(48),
  );
  const cancelled = stalled.then(
    () => {
      throw new Error('Cancelled request succeeded');
    },
    (error) => {
      assert.match(error.message, /已取消/);
    },
  );
  await started;
  await page.evaluate(() => window.jam.call('android-lan-cancel'));
  await Promise.race([
    cancelled,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Cancellation timeout')), 5000)),
  ]);
  assert.equal(
    (await page.evaluate((url) => window.jam.call('android-lan-list', { url }), url.href)).length,
    1,
  );
  console.log(
    'ANDROID_LAN_CHECK_PASSED',
    JSON.stringify({
      httpDownload: true,
      httpUpload: true,
      beats: received.analysis.beats.length,
      downbeats: received.analysis.downbeats.length,
      publicAddressRefused: true,
      scanner,
      cancellationAndReconnect: true,
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    server?.stop();
    await browser?.close();
    slow?.closeAllConnections();
    slow?.close();
  });
