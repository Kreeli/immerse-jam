const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve('.runtime/test-workspaces');
fs.mkdirSync(root, { recursive: true });
const area = fs.mkdtempSync(path.join(root, 'setup-progress-'));
const harness = path.join(area, 'main.cjs');
fs.writeFileSync(
  harness,
  `const { app } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(area, 'profile'))});
app.whenReady().then(async () => { globalThis.setupProgress = await require(${JSON.stringify(path.resolve('desktop/setup-progress.cjs'))}).open(app); });`,
);
let app;
(async () => {
  app = await electron.launch({
    args: [harness, '--lang=zh-CN'],
    executablePath: require('electron'),
  });
  const page = await app.firstWindow(),
    errors = [];
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(
    () =>
      new Promise((resolve) => {
        const ready = () => (globalThis.setupProgress ? resolve() : setTimeout(ready, 20));
        ready();
      }),
  );
  page.on('pageerror', (error) => errors.push(error.message));
  await app.evaluate(() =>
    globalThis.setupProgress.send({
      stage: { index: 3, total: 6, name: 'model', modelName: 'BS RoFormer SW' },
      file: 'model.ckpt',
      progress: 0.65,
      received: 65 * 1048576,
      total: 100 * 1048576,
      bytesPerSecond: 2 * 1048576,
    }),
  );
  await page.getByText('65%', { exact: true }).waitFor();
  assert.equal(await page.locator('#bytes').textContent(), '65.0 MiB / 100.0 MiB');
  assert.equal(await page.locator('#speed').textContent(), '2.0 MiB/s');
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight),
    'progress window fits without clipping',
  );
  await page.screenshot({ path: '.runtime/review-installation-progress.png' });
  await app.evaluate(() =>
    globalThis.setupProgress.send({ phase: 'verify', message: '正在校验下载文件…' }),
  );
  await page.waitForFunction(() => !document.querySelector('#download').hasAttribute('value'));
  assert.equal(await page.locator('#percent').textContent(), '');
  assert.equal(await page.locator('#bytes').textContent(), '');
  assert.deepEqual(errors, []);
  console.log('SETUP_PROGRESS_CHECK_PASSED');
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.evaluate(({ app }) => app.exit(0)).catch(() => {});
    await app?.close().catch(() => {});
  });
