const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { Store } = require('../desktop/store.cjs');
const { createInteractionFixture } = require('./fixtures.cjs');
const { data, store, p, resultA, resultB } = createInteractionFixture();
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
async function waitReady() {
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
}
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
  await waitReady();
  await page.waitForFunction(
    () => Number(document.querySelector('.waveform').dataset.peakCount) > 1000,
  );
  assert.ok(
    Number(await page.locator('.waveform').getAttribute('data-peak-max')) < 0.00001,
    'total waveform cancels opposite-phase tracks',
  );
  await page.getByRole('button', { name: '显示人声波形', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.waveform').dataset.source === 'vocals' &&
      Number(document.querySelector('.waveform').dataset.peakMax) > 0.1,
  );
  await page.getByRole('button', { name: '总混音波形', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelector('.waveform').dataset.source === 'mix' &&
      Number(document.querySelector('.waveform').dataset.peakMax) < 0.00001,
  );
  await range('播放进度', 30);
  await page.getByRole('combobox', { name: '当前分离结果', exact: true }).selectOption(resultB);
  await waitReady();
  assert.equal(await page.locator('.track-control').count(), 6);
  assert.ok(
    Math.abs(
      Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) - 30,
    ) < 0.2,
    'result switch preserves position',
  );
  await page.getByTitle('重命名分离结果', { exact: true }).click();
  await page.getByRole('textbox', { name: '分离结果名称', exact: true }).fill('六轨练习版本');
  await page.getByRole('button', { name: '保存名称', exact: true }).click();
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="当前分离结果"]')
      .selectedOptions[0].textContent.includes('六轨练习版本'),
  );
  await waitReady();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(900);
  const before = Number(await page.locator('.waveform').getAttribute('data-window-start'));
  await page.waitForTimeout(700);
  const after = Number(await page.locator('.waveform').getAttribute('data-window-start'));
  assert.ok(after > before + 0.4);
  assert.ok(
    Math.abs(
      Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) -
        (after + 10),
    ) < 0.2,
  );
  const wave = await page.locator('.waveform').boundingBox();
  const at = Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue());
  await page.mouse.move(wave.x + wave.width * 0.5, wave.y + wave.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(wave.x + wave.width * 0.25, wave.y + wave.height * 0.5, { steps: 8 });
  await page.mouse.up();
  const scrubbed = Number(
    await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue(),
  );
  assert.ok(scrubbed > at + 4.7 && scrubbed < at + 5.5, JSON.stringify({ at, scrubbed }));
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: 'test-output/v012-wave.png' });
  await page.getByRole('button', { name: '和弦', exact: true }).click();
  await page.getByRole('button', { name: '新建自制谱', exact: true }).click();
  await page.getByRole('textbox', { name: '和弦谱名称', exact: true }).fill('我的练习谱');
  await range('播放进度', 0);
  await page.locator('.practice-area').evaluate((element) => (element.scrollTop = 0));
  const bar0 = page.locator('[data-bar-id="bar-0"]'),
    bar2 = page.locator('[data-bar-id="bar-2"]');
  await bar0.getByRole('button', { name: '第 1 小节第 1 个空位', exact: true }).click();
  await page.getByRole('textbox', { name: '和弦名称', exact: true }).fill('Am7');
  await page.getByRole('button', { name: '保存和弦', exact: true }).click();
  await page.getByRole('button', { name: '第 3 小节添加空位', exact: true }).click();
  await bar0.locator('.chord-token').first().dragTo(bar2.locator('.chord-slot').nth(1));
  await page.waitForFunction(
    () =>
      document.querySelector('[data-bar-id="bar-2"]').querySelectorAll('.chord-token')[1]
        .textContent === 'Am7',
  );
  assert.ok(!(await bar0.locator('.chord-token').first().innerText()).includes('Am7'));
  assert.equal(await bar2.locator('.chord-slot').count(), 2);
  assert.ok(
    await page.getByRole('button', { name: '第 3 小节添加空位', exact: true }).isDisabled(),
  );
  await page.getByRole('button', { name: '删除第 3 小节第 2 个和弦', exact: true }).click();
  await page.getByRole('button', { name: '删除第 3 小节第 2 个空位', exact: true }).click();
  assert.equal(await bar2.locator('.chord-slot').count(), 1);
  assert.equal(await bar2.getAttribute('data-start'), '4');
  assert.equal(await bar2.getAttribute('data-end'), '6');
  await page
    .locator('.bank-chords button')
    .filter({ hasText: /^G$/ })
    .dragTo(bar2.locator('.chord-slot').first());
  await page.waitForFunction(
    () =>
      document.querySelector('[data-bar-id="bar-2"]').querySelector('.chord-token').textContent ===
      'G',
  );
  await page.getByRole('button', { name: '第 3 小节添加空位', exact: true }).click();
  await page.locator('.chart-timing summary').click();
  await page.getByRole('combobox', { name: '第二和弦起拍', exact: true }).selectOption('4');
  assert.equal(
    store
      .get(p.id)
      .chordCharts.find((chart) => chart.id === store.get(p.id).activeChordChartId)
      .bars.find((bar) => bar.id === 'bar-2').splitAt,
    0.75,
  );
  await range('播放进度', 4.1);
  await page.getByRole('button', { name: '将所选小节起点对齐到当前播放位置', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[data-bar-id="bar-2"]').dataset.start === '4.1',
  );
  await page.locator('.chart-timing summary').click();
  await range('播放进度', 75);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(1200);
  const visible = await page.locator('.playing-measure').evaluate((element) => {
    const area = element.closest('.practice-area').getBoundingClientRect(),
      rect = element.getBoundingClientRect();
    return rect.top >= area.top && rect.bottom <= area.bottom;
  });
  assert.ok(visible, 'active measure scrolls into view');
  assert.ok(await page.locator('.practice-area').evaluate((element) => element.scrollTop > 200));
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: 'test-output/v012-chords.png' });
  await page.getByTitle('返回曲库', { exact: true }).click();
  await page.locator('.song-info').filter({ hasText: '交互验收' }).click();
  await waitReady();
  assert.equal(
    await page.getByRole('textbox', { name: '和弦谱名称', exact: true }).inputValue(),
    '我的练习谱',
  );
  assert.equal(await page.locator('[data-bar-id="bar-2"] .chord-token').first().innerText(), 'G');
  assert.equal(store.get(p.id).results.length, 2);
  assert.equal(
    store.get(p.id).results.find((result) => result.id === resultB).name,
    '六轨练习版本',
  );
  assert.deepEqual(errors, []);
  console.log(
    'INTERACTION_CHECK_PASSED',
    JSON.stringify({
      trueMix: true,
      trackWaveform: true,
      centeredWindow: true,
      chordMoves: true,
      maxTwoChords: true,
      followPlayback: true,
      savedCustomChart: true,
      independentResults: true,
      errors,
    }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    await page?.keyboard.press('Escape').catch(() => {});
    await page?.screenshot({ path: 'test-output/v012-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
