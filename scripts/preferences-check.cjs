const { _electron: electron } = require('playwright');
const path = require('node:path'),
  assert = require('node:assert/strict');
const { createInteractionFixture } = require('./fixtures.cjs');
const { createSession } = require('../desktop/sessions.cjs');
const { data, store, p } = createInteractionFixture(20);
createSession(store, { kind: 'practice', sourceId: p.id, title: '偏好验收' });
let app, page;
(async () => {
  app = await electron.launch({
    executablePath: process.env.TEST_PACKAGED
      ? path.resolve('release/win-unpacked/Immerse Jam.exe')
      : require('electron'),
    args: process.env.TEST_PACKAGED ? ['--mute-audio'] : ['.', '--mute-audio'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.resolve(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    const original = window.AudioContext;
    window.AudioContext = class extends original {
      constructor(...args) {
        super(...args);
        window.__testContext = this;
      }
    };
  });
  await page.getByRole('button', { name: '跟练/创作', exact: true }).click();
  await page.getByRole('button', { name: '打开 偏好验收', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.getByRole('button', { name: '设置与模型', exact: true }).click();
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await page.getByRole('combobox', { name: 'Color mode', exact: true }).selectOption('light');
  await page.getByRole('combobox', { name: 'Accent color', exact: true }).selectOption('blue');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  assert.ok(
    await page
      .locator('.model-description strong')
      .filter({ hasText: 'BS RoFormer SW · Six stems' })
      .count(),
  );
  const settingsText = await page.locator('.modal').innerText();
  assert.ok(!/[\u4e00-\u9fff]/.test(settingsText.replace('简体中文', '')), settingsText);
  await page.waitForTimeout(250);
  await page.screenshot({ path: 'test-output/v014-settings-en-light.png' });
  await page.getByRole('button', { name: 'Close window', exact: true }).click();
  await page.screenshot({ path: 'test-output/v014-player-en-light.png' });
  await page.getByRole('button', { name: 'Practice recording', exact: true }).click();
  await page.evaluate(() => {
    const context = window.__testContext,
      destination = context.createMediaStreamDestination();
    navigator.mediaDevices.getUserMedia = async () => destination.stream;
    const create = context.createOscillator.bind(context);
    context.createOscillator = function (...args) {
      const oscillator = create(...args),
        start = oscillator.start.bind(oscillator);
      oscillator.start = function (at) {
        const buffer = context.createBuffer(1, 4800, context.sampleRate),
          samples = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++)
          samples[i] = 0.3 * Math.sin(i * 0.2) * Math.exp(-i / 500);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(destination);
        source.start(at + 0.18);
        return start(at);
      };
      return oscillator;
    };
  });
  await page.getByRole('button', { name: 'Test and estimate latency', exact: true }).click();
  await page.waitForSelector('.calibration-result', { timeout: 20000 });
  const calibration = await page.locator('.calibration-result').innerText(),
    match = calibration.match(/correction\s+(-?\d+)/i);
  assert.ok(match, calibration);
  assert.ok(Math.abs(Number(match[1]) - 180) < 35, calibration);
  await page.getByRole('button', { name: 'Apply correction', exact: true }).click();
  assert.ok(
    Math.abs(
      Number(
        await page
          .getByRole('spinbutton', { name: 'Recording latency correction', exact: true })
          .inputValue(),
      ) - 180,
    ) < 35,
  );
  await page.screenshot({ path: 'test-output/v014-calibration.png' });
  await page.getByRole('button', { name: 'Close recording window', exact: true }).click();
  await page.getByRole('button', { name: 'Settings & models', exact: true }).click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('immerse.preferences')));
  assert.equal(saved.language, 'en');
  assert.equal(saved.theme, 'light');
  assert.equal(saved.accent, 'blue');
  await page
    .getByRole('combobox', { name: 'Interface language', exact: true })
    .selectOption('zh-CN');
  await page.getByRole('combobox', { name: '明暗主题', exact: true }).selectOption('dark');
  await page.getByRole('combobox', { name: '强调色', exact: true }).selectOption('rose');
  assert.deepEqual(errors, []);
  console.log(
    'PREFERENCES_CHECK_PASSED',
    JSON.stringify({ english: true, lightBlue: true, preferencesSaved: true, calibration, errors }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    await page?.screenshot({ path: 'test-output/v014-preferences-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
