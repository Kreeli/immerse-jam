const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  readline = require('node:readline'),
  assert = require('node:assert/strict');
const parent = path.resolve('.runtime/test-workspaces');
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'pointer-'));
const output = path.resolve('.runtime/settings-followup-20261105');
fs.mkdirSync(output, { recursive: true });
const rl = readline.createInterface({ input: process.stdin, terminal: false });
function ack() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      rl.off('line', line);
      reject(new Error('Pointer verification timed out'));
    }, 600000);
    const line = (text) => {
      if (text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').trim() !== 'verify') return;
      clearTimeout(timer);
      rl.off('line', line);
      resolve();
    };
    rl.on('line', line);
  });
}
let app, page;
const checks = [];
(async () => {
  app = await electron.launch({
    executablePath: require('electron'),
    args: ['.', '--mute-audio'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: path.join(root, 'library'),
      IMMERSE_PROFILE_DIR: path.join(root, 'profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime/audit-runtime'),
    },
  });
  page = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setMinimumSize(360, 280);
    w.on('page-title-updated', (e) => e.preventDefault());
    w.setTitle('Immerse Jam · 原生点击验收');
    w.showInactive();
  });
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  for (const scale of [1.5, 1]) {
    await page.getByRole('button', { name: '设置与模型', exact: true }).click();
    await page.getByRole('combobox', { name: '界面缩放', exact: true }).selectOption(String(scale));
    await page.waitForFunction(
      (scale) => JSON.parse(localStorage.getItem('immerse.preferences')).uiScale === scale,
      scale,
    );
    await app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      if (!w.isMaximized())
        await new Promise((resolve) => {
          w.once('maximize', resolve);
          w.maximize();
        });
      await new Promise((resolve) => {
        w.once('unmaximize', resolve);
        w.unmaximize();
      });
      w.setSize(1000, 780);
      w.showInactive();
    });
    const state = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      return { scale: w.webContents.getZoomFactor(), maximized: w.isMaximized() };
    });
    assert.equal(state.scale, scale);
    assert.equal(state.maximized, false);
    console.log('POINTER_READY', JSON.stringify(state));
    await ack();
    assert.equal(await page.locator('.settings-workspace').count(), 0);
    assert.equal(
      await page.evaluate(() => JSON.parse(localStorage.getItem('immerse.preferences')).uiScale),
      scale,
    );
    checks.push({ scale, restored: true, nativeBackClosedSettings: true });
    console.log('POINTER_PASSED', scale);
  }
  fs.writeFileSync(
    path.join(output, 'native-pointer-result.json'),
    JSON.stringify({ passed: true, checks, fixture: root }, null, 2),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    fs.writeFileSync(
      path.join(output, 'native-pointer-result.json'),
      JSON.stringify({ passed: false, checks, error: String(error) }, null, 2),
    );
  })
  .finally(async () => {
    rl.close();
    process.stdin.pause();
    await app?.close();
  });
