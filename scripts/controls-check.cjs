const { _electron: electron } = require('playwright');
const path = require('node:path'),
  assert = require('node:assert/strict');
const { createInteractionFixture } = require('./fixtures.cjs');
const { data, store, p, resultB } = createInteractionFixture(30, true);
let app, page;
async function range(name, value) {
  await page.getByRole('slider', { name, exact: true }).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      element,
      String(value),
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function ready() {
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
}
const wait = (ms) => page.waitForTimeout(ms);
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
  await page.locator('.song-info').filter({ hasText: '交互验收' }).click();
  await ready();
  await page.getByRole('combobox', { name: '当前分离结果', exact: true }).selectOption(resultB);
  await ready();
  await page.waitForFunction(
    () =>
      document.querySelector('.waveform').dataset.source === 'mix' &&
      Number(document.querySelector('.waveform').dataset.peakMax) > 0.03 &&
      !document.querySelector('.play-main').disabled,
  );
  assert.equal(await page.getByText('智能节拍器', { exact: true }).count(), 1);
  await page.getByRole('checkbox', { name: '启用智能节拍器', exact: true }).uncheck();
  assert.equal(await page.locator('.ab-point').count(), 0);
  assert.ok(await page.locator('.brand-mark img').evaluate((image) => image.naturalWidth > 0));
  const timings = [];
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await page.getByRole('button', { name: '显示人声波形', exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector('.waveform').dataset.source === 'vocals' &&
        Number(document.querySelector('.waveform').dataset.peakMax) > 0.1,
    );
    await page.getByRole('button', { name: '显示人声波形', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.waveform').dataset.source === 'mix');
    timings.push(Date.now() - start);
  }
  assert.ok(Math.max(...timings) < 700, JSON.stringify(timings));
  const listen = page.getByRole('button', { name: '选听', exact: true }),
    close = page.getByRole('button', { name: '关闭声音', exact: true });
  await listen.nth(0).click();
  await listen.nth(1).click();
  assert.equal(await listen.nth(0).getAttribute('aria-pressed'), 'true');
  assert.equal(await listen.nth(1).getAttribute('aria-pressed'), 'true');
  await close.nth(0).click();
  assert.equal(await listen.nth(0).getAttribute('aria-pressed'), 'false');
  assert.equal(await close.nth(0).getAttribute('aria-pressed'), 'true');
  await listen.nth(0).click();
  assert.equal(await close.nth(0).getAttribute('aria-pressed'), 'false');
  await range('播放进度', 1);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await wait(350);
  const level = async (name) =>
    Number(
      await page
        .getByRole('meter', { name: name + '当前声音大小', exact: true })
        .getAttribute('data-level'),
    );
  const loud = await level('人声');
  assert.ok(loud > 0.05, `loud meter ${loud}`);
  assert.ok((await level('吉他')) < 1e-6, 'unselected track is silent');
  await range('播放进度', 4.2);
  await wait(280);
  const silent = await level('人声');
  assert.ok(silent < 1e-5, `silent section ${silent}`);
  await range('播放进度', 5.3);
  await wait(280);
  const quiet = await level('人声');
  assert.ok(quiet > 0 && quiet < loud * 0.2, `quiet ${quiet}, loud ${loud}`);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await listen.nth(0).click();
  await listen.nth(1).click();
  await range('播放进度', 3);
  await page.getByRole('button', { name: '设置循环段落开始', exact: true }).click();
  await range('播放进度', 4.5);
  await page.getByRole('button', { name: '设置循环段落结束', exact: true }).click();
  await page.getByRole('button', { name: '重命名循环段落 循环段落 1', exact: true }).click();
  await page.getByRole('textbox', { name: '循环段落名称', exact: true }).fill('主歌慢练');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await wait(1900);
  const loopPosition = Number(
    await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue(),
  );
  assert.ok(loopPosition >= 3 && loopPosition < 4.5);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '删除循环段落 主歌慢练', exact: true }).click();
  assert.equal(store.get(p.id).bookmarks.filter((mark) => mark.end).length, 0);
  await range('播放进度', 10);
  await page.getByRole('button', { name: '添加标记点', exact: true }).click();
  await page.getByRole('button', { name: '重命名标记点 标记点 1', exact: true }).click();
  await page.getByRole('textbox', { name: '标记点名称', exact: true }).fill('难点');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await range('播放进度', 20);
  await page.getByRole('button', { name: '跳到标记点 难点', exact: true }).click();
  assert.equal(
    Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()),
    10,
  );
  await page.getByRole('button', { name: '删除标记点 难点', exact: true }).click();
  assert.equal(store.get(p.id).bookmarks.length, 0);
  await page.getByRole('combobox', { name: '右侧面板', exact: true }).selectOption('mixer');
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).check();
  await page.getByRole('spinbutton', { name: '预备拍 BPM', exact: true }).fill('120');
  await page.getByRole('spinbutton', { name: '预备拍 BPM', exact: true }).blur();
  await page.getByRole('combobox', { name: '预备拍拍数', exact: true }).selectOption('2');
  await range('播放进度', 20);
  await page.evaluate(() => {
    window.__countClicks = 0;
    const original = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      window.__countClicks++;
      return original.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await wait(350);
  assert.ok(
    Math.abs(
      Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) - 20,
    ) < 0.03,
  );
  assert.ok(await page.locator('.count-in-badge').count());
  await wait(2200);
  assert.ok(
    Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) > 21,
  );
  assert.equal(
    await page.evaluate(() => window.__countClicks),
    2,
    'only the two preparatory clicks, no continuous metronome',
  );
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).uncheck();
  await page.locator('.analysis-meta button').nth(1).click();
  await page.getByRole('spinbutton', { name: '校准 BPM', exact: true }).fill('125.5');
  await page.locator('.analysis-editor').getByRole('button', { name: '保存', exact: true }).click();
  assert.equal(store.get(p.id).analysis.bpm, 125.5);
  assert.equal(store.get(p.id).analysis.tempoReviewed, true);
  await page.screenshot({ path: 'test-output/v013-controls.png' });
  assert.deepEqual(errors, []);
  console.log(
    'PLAYBACK_CONTROLS_PASSED',
    JSON.stringify({
      togglePairMs: timings,
      loud,
      silent,
      quiet,
      loopPosition,
      markers: true,
      countInOnly: true,
      manualBpm: true,
      errors,
    }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    console.error(
      'Waveform:',
      await page
        ?.locator('.waveform')
        .evaluate((element) => ({ ...element.dataset }))
        .catch(() => null),
    );
    await page?.keyboard.press('Escape').catch(() => {});
    await page?.screenshot({ path: 'test-output/v013-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
