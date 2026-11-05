// Isolated UI acceptance. Native endpoints are simulated here; native-audio-check.cjs tests real silent output separately.
const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createInteractionFixture } = require('./fixtures.cjs');
const { range } = require('./ui-gestures.cjs');
const { data, store, p, resultB } = createInteractionFixture(20);
store.selectResult(p.id, resultB);
const output = path.resolve('.runtime/settings-followup-20261105');
fs.mkdirSync(output, { recursive: true });
let app, page;
const errors = [],
  checks = [];
const shot = async (name) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(250);
  const bytes = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'),
  );
  fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(bytes, 'base64'));
};
const ready = () =>
  page.waitForFunction(
    () => document.querySelector('.play-main') && !document.querySelector('.play-main').disabled,
  );
const engineReady = () =>
  page.waitForFunction(() => {
    const el = document.querySelector('select[aria-label="音频系统"]');
    return el && !el.matches(':disabled');
  });
const back = () => page.getByRole('button', { name: '返回音乐工作区', exact: true }).click();
const open = async (section) => {
  await page.getByRole('button', { name: '设置与模型', exact: true }).click();
  if (section) await page.getByRole('button', { name: section, exact: true }).click();
};
const inputAcknowledged = () =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Native pointer acknowledgement timed out')),
      600000,
    );
    process.stdin.once('data', () => {
      clearTimeout(timer);
      resolve();
    });
  });
(async () => {
  app = await electron.launch({
    executablePath: require('electron'),
    args: ['.', '--mute-audio'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.join(data, 'profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime/audit-runtime'),
    },
  });
  page = await app.firstWindow();
  page.on('pageerror', (e) => errors.push(e.message));
  await app.evaluate(({ BrowserWindow, ipcMain }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setMinimumSize(360, 280);
    win.setSize(1360, 900);
    win.showInactive();
    win.on('page-title-updated', (e) => e.preventDefault());
    win.setTitle('Immerse Jam · 设置修复验收');
    global.__followup = {
      starts: [],
      stops: [],
      active: new Set(),
      packets: 0,
      energy: 0,
      hideAsio: false,
    };
    ipcMain.removeHandler('jam:audio-output-info');
    ipcMain.handle('jam:audio-output-info', () => ({
      available: true,
      devices: [
        'wasapi',
        'wasapi-low-latency',
        'wasapi-exclusive',
        'directsound',
        ...(global.__followup.hideAsio ? [] : ['asio']),
      ].flatMap((backend) => [
        {
          backend,
          deviceId: backend === 'asio' ? 'Synthetic ASIO' : 'default',
          name: backend === 'asio' ? 'Synthetic ASIO' : 'Synthetic output',
          isDefault: true,
          deviceSampleRate: 48000,
        },
        ...(backend === 'asio'
          ? [
              {
                backend,
                deviceId: 'unavailable-driver',
                name: 'Unavailable driver',
                isDefault: false,
                deviceSampleRate: null,
              },
            ]
          : []),
      ]),
    }));
    ipcMain.removeHandler('jam:audio-output-start');
    ipcMain.handle('jam:audio-output-start', (_e, config) => {
      if (
        config.deviceId === 'unavailable-driver' ||
        (config.backend === 'wasapi-exclusive' && config.sampleRate === 96000)
      )
        throw new Error('Synthetic driver unavailable');
      const id = 'stream-' + (global.__followup.starts.length + 1);
      global.__followup.starts.push(config);
      global.__followup.active.add(id);
      return {
        type: 'ready',
        streamId: id,
        ...config,
        deviceSampleRate: config.backend === 'wasapi' ? 48000 : config.sampleRate,
        deviceBufferFrames: 256,
      };
    });
    ipcMain.removeHandler('jam:audio-output-stop');
    ipcMain.handle('jam:audio-output-stop', (_e, { streamId }) => {
      global.__followup.stops.push(streamId);
      global.__followup.active.delete(streamId);
      return true;
    });
    ipcMain.removeHandler('jam:audio-output-write');
    ipcMain.handle('jam:audio-output-write', (_e, { streamId, samples }) => {
      if (!global.__followup.active.has(streamId)) return { accepted: false, stale: true };
      const values = new Float32Array(samples);
      global.__followup.packets++;
      for (const value of values) global.__followup.energy += Math.abs(value);
      return { accepted: true };
    });
  });
  const instrument = () => {
    window.__audioContexts = [];
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__audioContexts.push(this);
      }
    };
  };
  await page.addInitScript(instrument);
  await page.evaluate(instrument);
  await page.getByRole('button', { name: '第一次使用？', exact: true }).first().click();
  await page.getByRole('heading', { name: '从一首歌开始', exact: true }).waitFor();
  await shot('01-guide-dark');
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await shot('02-guide-analysis');
  await page.getByRole('button', { name: '打开模型设置', exact: true }).click();
  await page.getByRole('heading', { name: '模型与运行库', exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('jam:event', {
      scope: 'runtime',
      type: 'log',
      message: '\x1b[0m  \r\n',
    }),
  );
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.settings-install-log').count(), 0);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('jam:event', {
      scope: 'runtime',
      type: 'log',
      message: 'Preparing components\nReady',
    }),
  );
  await page.getByText('查看准备记录', { exact: true }).click();
  assert.match(await page.locator('.settings-install-log').innerText(), /Preparing components/);
  await shot('06-preparation-log');
  checks.push('guide navigation and non-empty folded preparation logs');
  await back();
  await page.getByRole('button', { name: '打开 交互验收', exact: true }).click();
  await ready();
  await range(page, '播放进度', 5);
  await open();
  assert.equal(await page.locator('.settings-close').count(), 0);
  assert.equal(
    await page.locator('.wave-color-swatches button').first().getAttribute('aria-label'),
    '波形颜色 #66CCFF',
  );
  await page.locator('.wave-color-swatches button').first().click();
  assert.equal(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('immerse.preferences')).waveColor.toLowerCase(),
    ),
    '#66ccff',
  );
  await shot('03-general-cyan');
  await page.getByRole('button', { name: '音频与录音', exact: true }).click();
  await engineReady();
  const system = page.getByRole('combobox', { name: '音频系统', exact: true }),
    rate = page.getByRole('combobox', { name: '播放采样率', exact: true });
  await rate.selectOption('44100');
  await engineReady();
  assert.equal(await page.evaluate(() => window.__audioContexts.at(-1).sampleRate), 44100);
  await back();
  assert.ok(
    Math.abs(
      Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) - 5,
    ) < 0.05,
  );
  await open('音频与录音');
  await engineReady();
  await system.selectOption('wasapi');
  await engineReady();
  await shot('04-engine-native');
  await back();
  await page.locator('.play-main').click();
  await page.waitForTimeout(700);
  const flowing = await app.evaluate(() => ({
    packets: global.__followup.packets,
    energy: global.__followup.energy,
  }));
  assert.ok(flowing.packets > 4 && flowing.energy > 1, JSON.stringify(flowing));
  await page.locator('.play-main').click();
  await page.waitForTimeout(250);
  assert.equal(await app.evaluate(() => global.__followup.active.size), 0);
  checks.push(
    'real 44.1 kHz processing context, preserved seek position and non-zero final mix over the IPC bridge',
  );
  await open('音频与录音');
  await engineReady();
  await system.selectOption('asio');
  await engineReady();
  const device = page.getByRole('combobox', { name: '原生输出设备', exact: true });
  await device.selectOption('unavailable-driver');
  await engineReady();
  assert.equal(await device.inputValue(), 'Synthetic ASIO');
  assert.match(await page.locator('.audio-engine-settings [role=alert]').innerText(), /切换失败/);
  await shot('05-engine-rollback');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__restoreStorage = () => {
      Storage.prototype.setItem = original;
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === 'immerse.audio.engine') throw new Error('Synthetic disk full');
      return original.call(this, key, value);
    };
  });
  await rate.selectOption('96000');
  await engineReady();
  assert.equal(await rate.inputValue(), '44100');
  assert.equal(await page.evaluate(() => window.__audioContexts.at(-1).sampleRate), 44100);
  await page.evaluate(() => window.__restoreStorage());
  await system.selectOption('web-audio');
  await engineReady();
  await app.evaluate(() => {
    global.__followup.hideAsio = true;
  });
  await page.getByRole('button', { name: '刷新音频系统', exact: true }).click();
  await engineReady();
  await page.getByText('未检测到可用的64位ASIO驱动。', { exact: true }).waitFor();
  assert.equal(
    await system.locator('option[value=asio]').evaluate((option) => option.disabled),
    true,
  );
  await system.focus();
  await system.press('End');
  await page.waitForFunction(
    () => JSON.parse(localStorage.getItem('immerse.audio.engine')).backend === 'directsound',
  );
  await engineReady();
  await system.selectOption('web-audio');
  await engineReady();
  checks.push('ASIO capability detection, driver failure and failed-persistence rollback');
  await page.getByRole('button', { name: '常规与界面', exact: true }).click();
  await page.getByRole('combobox', { name: '明暗主题', exact: true }).selectOption('light');
  await back();
  await page.getByRole('button', { name: '第一次使用？', exact: true }).first().click();
  await shot('07-guide-light');
  await page.getByRole('button', { name: '跳过引导', exact: true }).click();
  await open();
  await page.getByRole('combobox', { name: '明暗主题', exact: true }).selectOption('dark');
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await page.getByRole('button', { name: 'Audio and recording', exact: true }).click();
  const english = await page.locator('.audio-engine-settings').innerText();
  assert.ok(!/[一-鿿]/.test(english), english);
  await page.getByRole('button', { name: 'General and appearance', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Interface language', exact: true })
    .selectOption('zh-CN');
  checks.push('bilingual audio settings and guide visuals in both themes');
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setSize(640, 720);
    win.maximize();
    win.unmaximize();
  });
  await page.getByRole('combobox', { name: '界面缩放', exact: true }).selectOption('1.5');
  assert.equal(await page.locator('html').getAttribute('data-desktop-modal'), 'open');
  const dragOwners = await page
    .locator('.nr-nav-brand,.nr-ph.player-header,.library-header')
    .evaluateAll((nodes) =>
      nodes.map((e) => getComputedStyle(e).getPropertyValue('-webkit-app-region')),
    );
  assert.ok(
    dragOwners.length > 0 && dragOwners.every((value) => value === 'no-drag'),
    JSON.stringify(dragOwners),
  );
  await shot('08-narrow-150');
  if (process.argv.includes('--keep-open')) {
    console.log('NATIVE_POINTER_STAGE_1_READY');
    await inputAcknowledged();
    assert.equal(await page.locator('.settings-workspace').count(), 0);
    checks.push('actual Windows pointer closes settings at 150% after window restore');
    await open();
    await page.getByRole('combobox', { name: '界面缩放', exact: true }).selectOption('1');
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(1100, 760);
      win.maximize();
      win.unmaximize();
    });
    console.log('NATIVE_POINTER_STAGE_2_READY');
    await inputAcknowledged();
    assert.equal(await page.locator('.settings-workspace').count(), 0);
    checks.push('actual Windows pointer closes settings at 100% after maximize/restore');
  } else await back();
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, 'followup-ui-result.json'),
    JSON.stringify({ passed: true, checks, errors, fixture: data }, null, 2),
  );
  console.log('SETTINGS_FOLLOWUP_CHECK_PASSED', JSON.stringify({ checks, errors, output }));
})()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(output, 'followup-failed.png') }).catch(() => {});
    fs.writeFileSync(
      path.join(output, 'followup-ui-result.json'),
      JSON.stringify(
        { passed: false, error: String(error), checks, errors, fixture: data },
        null,
        2,
      ),
    );
  })
  .finally(async () => {
    await app?.close();
  });
