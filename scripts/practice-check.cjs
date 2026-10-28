const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createInteractionFixture } = require('./fixtures.cjs');
const { attachScoreFixture } = require('./score-fixture.cjs');
const { data, store, p } = createInteractionFixture(40);
attachScoreFixture(store, p);

let app;
async function range(page, name, value) {
  await page.getByRole('slider', { name, exact: true }).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      element,
      String(value),
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function position(page) {
  return Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue());
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
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('.song-info').filter({ hasText: '交互验收' }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await range(page, '播放速度', 0.5);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(2400);
  const slowPosition = await position(page);
  assert.ok(slowPosition > 0.8 && slowPosition < 1.6, `Half speed position: ${slowPosition}`);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await range(page, '播放速度', 1);
  await range(page, '播放进度', 3);
  await page.getByRole('button', { name: '设置循环段落开始', exact: true }).click();
  await range(page, '播放进度', 4);
  await page.getByRole('button', { name: '设置循环段落结束', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(2000);
  const loopPosition = await position(page);
  assert.ok(loopPosition >= 3 && loopPosition < 4.15, `Loop segment position: ${loopPosition}`);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '停止循环', exact: true }).click();
  await range(page, '播放进度', 12);
  await page.screenshot({ path: 'test-output/v013-music-wave.png' });
  await page.getByRole('button', { name: '乐谱', exact: true }).click();
  await page.waitForSelector('.notation svg');
  await page.waitForTimeout(1500);
  await range(page, '播放进度', 12);
  await page.waitForTimeout(300);
  const before = await page.locator('.at-cursor-beat').evaluateAll((elements) =>
    elements.map((e) => ({
      style: e.getAttribute('style'),
      rect: e.getBoundingClientRect().toJSON(),
    })),
  );
  await range(page, '播放进度', 24);
  await page.waitForTimeout(300);
  const after = await page.locator('.at-cursor-beat').evaluateAll((elements) =>
    elements.map((e) => ({
      style: e.getAttribute('style'),
      rect: e.getBoundingClientRect().toJSON(),
    })),
  );
  assert.ok(before.length && after.length, 'Score cursor exists');
  assert.ok(before[0].rect.width >= 2, 'Score cursor remains visible after alphaTab scaling');
  assert.notDeepEqual(before, after, 'Score cursor follows aligned transport position');
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      halfSpeedPosition: slowPosition,
      loopPosition,
      scoreCursorBefore: before,
      scoreCursorAfter: after,
      pageErrors: errors,
    }),
  );
  await page.screenshot({ path: 'test-output/practice.png' });
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
