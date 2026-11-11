// Runs the built desktop UI against disposable local data. No private library or real microphone is used.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { Store } = require('../desktop/store.cjs');
const parent = path.resolve('.runtime/test-workspaces');
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'settings-ui-'));
const data = path.join(root, 'library'),
  runtime = path.join(root, 'runtime'),
  profile = path.join(root, 'profile');
new Store(data);
const output = path.resolve(
  process.env.IMMERSE_SETTINGS_QA_DIR || '.runtime/settings-validation-20261105',
);
fs.mkdirSync(output, { recursive: true });
let app, page;
const errors = [],
  checks = [];
const shot = async (name) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  // Native capture may otherwise return the preceding compositor frame or a theme transition.
  await page.waitForTimeout(350);
  const encoded = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(encoded, 'base64'));
};
const assertVisible = async (locator) => {
  await locator.waitFor({ state: 'visible' });
};
(async () => {
  app = await electron.launch({
    executablePath: require('electron'),
    args: [
      '.',
      '--mute-audio',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: profile,
      IMMERSE_RUNTIME_DIR: runtime,
    },
  });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setMinimumSize(360, 280);
    win.setSize(1360, 900);
    win.showInactive();
    global.__settingsInstallCalls = 0;
    global.__settingsCopyCalls = 0;
    ipcMain.removeHandler('jam:runtime-install');
    ipcMain.handle('jam:runtime-install', () => {
      global.__settingsInstallCalls++;
      return { installing: false };
    });
    // Avoid changing the user's clipboard while testing the copy feedback.
    ipcMain.removeHandler('jam:settings-copy-diagnostics');
    ipcMain.handle('jam:settings-copy-diagnostics', () => {
      global.__settingsCopyCalls++;
      return true;
    });
  });
  await assertVisible(page.getByRole('heading', { name: '从一首歌开始', exact: true }));
  await shot('01-first-run-guide');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await assertVisible(page.getByRole('heading', { name: '准备模型，再开始分析', exact: true }));
  await page.getByRole('button', { name: '打开模型设置', exact: true }).click();
  await assertVisible(page.getByRole('heading', { name: '模型与运行库', exact: true }));
  await page.waitForFunction(() => document.activeElement?.classList.contains('settings-back'));
  await page.getByRole('button', { name: '返回音乐工作区', exact: true }).click();
  await page.getByRole('button', { name: '第一次使用？', exact: true }).first().click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '上一步', exact: true }).click();
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await page.addInitScript(() => {
    window.__settingsDevices = [
      { kind: 'audioinput', deviceId: 'usb-a', label: 'Synthetic USB input' },
      { kind: 'audiooutput', deviceId: 'speaker-a', label: 'Synthetic speakers' },
      { kind: 'audiooutput', deviceId: 'broken-output', label: 'Synthetic unavailable output' },
    ];
    navigator.mediaDevices.enumerateDevices = async () => window.__settingsDevices;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__settingsContext = this;
      }
    };
    window.AudioContext.prototype.setSinkId = async function (id) {
      if (id === 'broken-output') throw new Error('Synthetic output unavailable');
      Object.defineProperty(this, 'sinkId', { value: id, writable: true, configurable: true });
    };
  });
  await page.reload();
  await page.getByRole('button', { name: '设置与模型', exact: true }).waitFor();
  assert.equal(await page.locator('.onboarding-guide').count(), 0);
  checks.push('first-run guide is skippable and does not repeat after reload');
  await page.getByRole('button', { name: '设置与模型', exact: true }).hover();
  await page.waitForSelector('.help-tooltip', { state: 'visible', timeout: 5000 });
  assert.match(await page.locator('.help-tooltip').innerText(), /更改界面/);
  await shot('10-hover-help');
  await page.getByRole('button', { name: '设置与模型', exact: true }).click();
  await assertVisible(page.getByRole('heading', { name: '常规与界面', exact: true }));
  assert.equal(await page.getByRole('button', { name: '快捷键', exact: true }).count(), 0);
  await shot('02-general-dark');
  await page.getByRole('checkbox', { name: '悬停说明', exact: true }).uncheck();
  await page.getByRole('button', { name: '返回音乐工作区', exact: true }).click();
  await page.getByRole('button', { name: '设置与模型', exact: true }).hover();
  await page.waitForTimeout(2200);
  assert.equal(await page.locator('.help-tooltip').count(), 0);
  await page.getByRole('button', { name: '设置与模型', exact: true }).click();
  await page.getByRole('checkbox', { name: '悬停说明', exact: true }).check();
  checks.push('delayed help appears and can be disabled');
  await page.getByRole('combobox', { name: '界面缩放', exact: true }).selectOption('1.25');
  assert.ok(
    Math.abs(
      (await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
      )) - 1.25,
    ) < 0.0001,
  );
  await page.getByRole('combobox', { name: '界面缩放', exact: true }).selectOption('1');
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await page.getByRole('combobox', { name: 'Color mode', exact: true }).selectOption('light');
  await shot('03-general-en-light');
  const general = await page.locator('.settings-workspace').innerText();
  assert.ok(!/[一-鿿]/.test(general.replaceAll('简体中文', '')), general);
  await page
    .getByRole('searchbox', { name: 'Search settings', exact: true })
    .fill('unmatched-settings-20261105');
  await assertVisible(page.getByRole('heading', { name: 'No matching settings', exact: true }));
  await page.getByRole('button', { name: 'Clear settings search', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search settings', exact: true }).fill('缓存');
  await assertVisible(page.getByRole('heading', { name: 'Storage and cache', exact: true }));
  await page.getByRole('button', { name: 'Clear settings search', exact: true }).click();
  checks.push('native zoom, English light theme and bilingual search');
  await page.getByRole('button', { name: 'Audio and recording', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Default input device', exact: true })
    .selectOption('usb-a');
  await page
    .getByRole('combobox', { name: 'Default output device', exact: true })
    .selectOption('speaker-a');
  const latency = page.getByRole('spinbutton', { name: 'Default latency correction', exact: true });
  await latency.fill('2501');
  await latency.blur();
  await assertVisible(
    page.getByRole('alert').filter({ hasText: 'Latency correction must be between' }),
  );
  const invalidSaved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('immerse.audio.defaults')),
  );
  assert.equal(invalidSaved.latencyMs, 0);
  await latency.fill('42');
  await latency.blur();
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('immerse.audio.defaults')).latencyMs === 42,
  );
  await page
    .getByRole('combobox', { name: 'Default output device', exact: true })
    .selectOption('broken-output');
  await assertVisible(page.getByRole('alert').filter({ hasText: 'Synthetic output unavailable' }));
  assert.equal(
    await page.getByRole('combobox', { name: 'Default output device', exact: true }).inputValue(),
    'speaker-a',
  );
  checks.push('audio defaults, invalid latency and routing failure preserve saved values');
  await page.evaluate(() => {
    const context = window.__settingsContext,
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
  await assertVisible(page.getByRole('button', { name: 'Cancel calibration', exact: true }));
  assert.equal(
    await page.getByRole('combobox', { name: 'Default output device', exact: true }).isDisabled(),
    true,
  );
  await page.waitForSelector('.calibration-result', { timeout: 25000 });
  await page.getByRole('button', { name: 'Apply correction', exact: true }).click();
  await page.waitForFunction(
    () => Math.abs(JSON.parse(localStorage.getItem('immerse.audio.defaults')).latencyMs - 180) < 35,
  );
  await shot('04-audio-calibration');
  checks.push('global calibration survives busy state and saves a synthetic 180ms correction');
  await page.getByRole('button', { name: 'Models and runtime', exact: true }).click();
  await page.getByRole('button', { name: 'Check runtime', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Runtime installation mode', exact: true })
    .selectOption('cpu');
  await page.getByRole('button', { name: 'Prepare / repair runtime', exact: true }).click();
  const prepare = page.getByRole('dialog', { name: 'Prepare runtime', exact: true });
  await assertVisible(prepare);
  await prepare.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await app.evaluate(() => global.__settingsInstallCalls), 0);
  await page
    .getByRole('combobox', { name: 'Filter models', exact: true })
    .selectOption('installed');
  await assertVisible(page.getByText('No models match this filter.', { exact: true }));
  await page.getByRole('combobox', { name: 'Filter models', exact: true }).selectOption('all');
  await shot('05-models-runtime');
  checks.push('runtime status and mode selection do not start installation; model filtering works');
  fs.mkdirSync(path.join(runtime, 'temp'), { recursive: true });
  const expired = path.join(runtime, 'temp', 'expired.bin'),
    partial = path.join(runtime, 'temp', 'resume.part');
  const model = path.join(runtime, 'models', 'protected-model.bin');
  for (const file of [expired, partial, model]) {
    fs.writeFileSync(file, 'synthetic-fixture');
    const old = new Date(Date.now() - 3 * 86400000);
    fs.utimesSync(file, old, old);
  }
  await page.getByRole('button', { name: 'Storage and cache', exact: true }).click();
  await page.locator('.settings-storage-row').first().waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-storage-id="temp"] .settings-byte-count')?.textContent ===
      '34 B',
  );
  await page.getByRole('button', { name: 'Preview cleanup', exact: true }).first().click();
  const cleanup = page.getByRole('dialog', { name: 'Confirm cleanup', exact: true });
  await assertVisible(cleanup);
  assert.match(await cleanup.innerText(), /Files to remove: 1/);
  await shot('06-storage-preview');
  await cleanup.getByRole('button', { name: 'Confirm cleanup', exact: true }).click();
  await assertVisible(page.locator('.settings-result'));
  assert.equal(fs.existsSync(expired), false);
  assert.ok(fs.existsSync(partial));
  assert.ok(fs.existsSync(model));
  assert.match(await page.locator('.settings-result').innerText(), /Files removed: 1/);
  await shot('07-storage-result');
  await assert.rejects(
    () => page.evaluate(() => window.jam.call('settings-open-location', { id: '../../Windows' })),
    /无效|Invalid/,
  );
  checks.push(
    'native cleanup preview removes only synthetic expired data; partial downloads and models survive',
  );
  await page.getByRole('button', { name: 'About and diagnostics', exact: true }).click();
  await page.getByRole('button', { name: 'Copy diagnostic summary', exact: true }).click();
  await assertVisible(page.getByText('Diagnostic summary copied', { exact: true }));
  assert.equal(await app.evaluate(() => global.__settingsCopyCalls), 1);
  await shot('08-about-diagnostics');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(640, 720));
  await assertVisible(page.getByRole('combobox', { name: 'Settings categories', exact: true }));
  await page
    .getByRole('combobox', { name: 'Settings categories', exact: true })
    .selectOption('general');
  await page.getByRole('combobox', { name: 'Interface scale', exact: true }).selectOption('1.5');
  assert.ok(
    await page
      .getByRole('button', { name: 'Return to the music workspace', exact: true })
      .isVisible(),
  );
  const layout = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.querySelector('.settings-workspace').scrollWidth,
  }));
  assert.ok(layout.scroll <= layout.width + 2, JSON.stringify(layout));
  await shot('09-narrow-150');
  await page.getByRole('combobox', { name: 'Interface scale', exact: true }).selectOption('1');
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.focus();
    win.webContents.focus();
  });
  await page.waitForFunction(() => document.hasFocus(), undefined, { timeout: 5000 });
  await page.getByRole('searchbox', { name: 'Search settings', exact: true }).focus();
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => ({
    inside: !!document.activeElement.closest('.settings-workspace-dialog'),
    focused: document.hasFocus(),
    tag: document.activeElement.tagName,
  }));
  assert.equal(focus.inside, true, JSON.stringify(focus));
  assert.equal(focus.focused, true, JSON.stringify(focus));
  assert.equal(focus.tag, 'SELECT', JSON.stringify(focus));
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await assertVisible(page.getByRole('heading', { name: 'Models and runtime', exact: true }));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].blur());
  await page.getByRole('button', { name: 'Return to the music workspace', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Manage models', exact: true }).count(), 0);
  await page
    .getByRole('button', { name: require('../shared/locales/en.json')['设置与模型'], exact: true })
    .click();
  await page
    .getByRole('combobox', { name: 'Settings categories', exact: true })
    .selectOption('models');
  await assertVisible(page.getByRole('heading', { name: 'Models and runtime', exact: true }));
  await page.getByRole('button', { name: 'Return to the music workspace', exact: true }).click();
  await app.evaluate(() => {
    delete process.env.IMMERSE_LOCALE;
  });
  await page.reload();
  await page.waitForSelector('html[lang="en"]');
  assert.equal(await page.locator('.onboarding-guide').count(), 0);
  const saved = await page.evaluate(() => ({
    preferences: JSON.parse(localStorage.getItem('immerse.preferences')),
    audio: JSON.parse(localStorage.getItem('immerse.audio.defaults')),
  }));
  assert.equal(saved.preferences.language, 'en');
  assert.equal(saved.preferences.theme, 'light');
  assert.equal(saved.audio.inputDeviceId, 'usb-a');
  assert.equal(saved.audio.outputDeviceId, 'speaker-a');
  checks.push('narrow 150% layout, keyboard focus, canonical model entry and restart persistence');
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        checks,
        errors,
        simulatedDelayMs: 180,
        calibrationMs: saved.audio.latencyMs,
        fixture: root,
      },
      null,
      2,
    ),
  );
  console.log('SETTINGS_UI_CHECK_PASSED', JSON.stringify({ checks, errors, output }));
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await page
      ?.screenshot({ path: path.join(output, 'failed.png'), timeout: 5000 })
      .catch(() => {});
    fs.writeFileSync(
      path.join(output, 'result.json'),
      JSON.stringify(
        { passed: false, error: String(error), checks, errors, fixture: root },
        null,
        2,
      ),
    );
  })
  .finally(async () => {
    await app?.close();
  });
