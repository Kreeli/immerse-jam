// Local simulator + isolated Electron acceptance of the real file bridge and archive importers.
// This relays chunks through DevTools for deterministic testing; it does not claim a WebRTC network test.
const { _electron: electron, chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process'),
  assert = require('node:assert/strict');
const adb =
  JSON.parse(fs.readFileSync('.runtime/android/config.json')).sdk + '/platform-tools/adb.exe';
const cmd = (...args) => cp.execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
let app, browser;
async function transfer(sender, receiver, source) {
  const [file] = await sender.evaluate(
    (id) => window.jam.call('peer-prepare', { ids: [id] }),
    source,
  );
  const id = await receiver.evaluate((file) => window.jam.call('peer-begin', file), file);
  let offset = 0;
  while (offset < file.size) {
    const chunk = await sender.evaluate(
      ({ id, offset }) => window.jam.call('peer-read', { id, offset, binary: true }),
      { id: file.id, offset },
    );
    const bytes =
      typeof chunk === 'string' ? Buffer.from(chunk, 'base64') : Buffer.from(Object.values(chunk));
    assert.ok(bytes.length > 0);
    offset = await receiver.evaluate(
      ({ id, offset, bytes }) =>
        window.jam.call('peer-append', { id, offset, chunk: Uint8Array.from(bytes) }),
      { id, offset, bytes: Array.from(bytes) },
    );
  }
  await receiver.evaluate((id) => window.jam.call('peer-finish', { id }), id);
  const [project] = await receiver.evaluate(
    (id) => window.jam.call('peer-select', { id, accept: true }),
    id,
  );
  return { project, bytes: file.size };
}
(async () => {
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
  const mobile = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes('/app/'));
  await mobile.waitForFunction(() => window.jam);
  const source = await mobile.evaluate(async () =>
    (await window.jam.call('library')).find((p) => p.title === 'Android 节拍与对齐验收'),
  );
  assert.ok(source);
  const data = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/android-peer-'));
  app = await electron.launch({
    executablePath: require('electron'),
    args: ['.', '--mute-audio'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.join(data, 'profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  const desktop = await app.firstWindow();
  await desktop.waitForFunction(() => window.jam);
  const incoming = await transfer(mobile, desktop, source.id);
  assert.deepEqual(incoming.project.analysis.beats, source.analysis.beats);
  assert.deepEqual(incoming.project.analysis.downbeats, source.analysis.downbeats);
  assert.deepEqual(incoming.project.alignment, source.alignment);
  const returned = await transfer(desktop, mobile, incoming.project.id);
  assert.deepEqual(returned.project.analysis.beats, source.analysis.beats);
  assert.deepEqual(returned.project.alignment, source.alignment);
  const exported = await mobile.evaluate(
    (id) => window.jam.call('export', { id, full: true }),
    source.id,
  );
  cmd('shell', 'input', 'keyevent', '4');
  const packageUri = 'content://app.immersejam.mobile.files/shared/' + encodeURIComponent(exported);
  const imported = mobile.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          off();
          reject(new Error('System share timeout'));
        }, 20000);
        const off = window.jam.onEvent((e) => {
          if (e.type === 'shared-import') {
            clearTimeout(timer);
            off();
            resolve(e.result);
          }
        });
      }),
  );
  cmd(
    'shell',
    'am',
    'start',
    '-a',
    'android.intent.action.VIEW',
    '-t',
    'application/octet-stream',
    '-d',
    packageUri,
    '-n',
    'app.immersejam.mobile/.MainActivity',
    '--grant-read-uri-permission',
  );
  const fromSystem = await imported;
  assert.deepEqual(fromSystem.analysis.beats, source.analysis.beats);
  console.log(
    'ANDROID_ARCHIVE_ROUNDTRIP_PASSED',
    JSON.stringify({
      mobileToDesktopBytes: incoming.bytes,
      desktopToMobileBytes: returned.bytes,
      beats: source.analysis.beats.length,
      downbeats: source.analysis.downbeats.length,
      midiAlignment: true,
      systemOpen: true,
      chunkRelay: 'DevTools (not a WebRTC network test)',
    }),
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
    await browser?.close();
  });
