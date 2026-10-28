const { createInteractionFixture } = require('./fixtures.cjs');
const { attachScoreFixture } = require('./score-fixture.cjs');
const fixture = process.env.TEST_DATA_DIR ? null : createInteractionFixture(40);
if (fixture) {
  fixture.p = fixture.store.selectResult(fixture.p.id, fixture.resultB);
  attachScoreFixture(fixture.store, fixture.p);
}
const testTitle = process.env.TEST_SONG_TITLE || fixture?.p.title || 'Test song';
const testData = process.env.TEST_DATA_DIR || fixture.data;
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const apps = [];
async function launch(data) {
  const app = await electron.launch({
    executablePath: process.env.TEST_PACKAGED
      ? path.resolve('release/win-unpacked/Immerse Jam.exe')
      : require('electron'),
    args: process.env.TEST_PACKAGED ? ['--mute-audio'] : ['.', '--mute-audio'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: path.resolve(data),
      IMMERSE_PROFILE_DIR: path.resolve(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  apps.push(app);
  const page = await app.firstWindow();
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.error('CONSOLE ERROR', m.text());
  });
  return page;
}
(async () => {
  fs.mkdirSync('test-output', { recursive: true });
  const page = await launch(testData);
  await page.waitForSelector('.songs');
  await page.locator('.song-info').filter({ hasText: testTitle }).first().click();
  await page.getByRole('button', { name: '播放', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(2300);
  const time = await page.locator('.time-now').innerText();
  assert.notEqual(time, '00:00');
  console.log('Playback advanced:', time);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  if (process.env.TEST_SKIP_SCORE !== '1') {
    await page.getByRole('button', { name: '乐谱', exact: true }).click();
    await page.waitForSelector('.notation svg');
    await page.waitForTimeout(1500);
    console.log('GP score rendered:', await page.locator('.notation svg').count());
    await page.screenshot({ path: 'test-output/score.png' });
    await page.getByRole('button', { name: '波形', exact: true }).click();
  }
  await page.screenshot({ path: 'test-output/player.png' });
  await page.getByRole('button', { name: '设备互传', exact: true }).click();
  await page.getByRole('button', { name: '生成配对二维码', exact: true }).click();
  await page.waitForSelector('.pair-box img');
  const address = await page.getByRole('textbox', { name: '配对地址' }).inputValue();
  const list = await fetch(new URL('/api/list' + new URL(address).search, address)).then((r) =>
    r.json(),
  );
  assert.equal(list.length, 1);
  const forbidden = await fetch(new URL('/api/list?token=wrong', address));
  assert.equal(forbidden.status, 403);
  console.log('LAN pairing, selected-song scope, token rejection passed');
  const receiver = await launch(process.env.TEST_RECEIVER_DIR || path.join(testData, 'receiver'));
  await receiver.waitForSelector('.library-header');
  await receiver.waitForTimeout(500);
  await receiver.getByRole('button', { name: '设备互传', exact: true }).click();
  await page.getByRole('button', { name: '发起远程连接', exact: true }).click();
  await page.getByRole('textbox', { name: '本机连接码' }).waitFor();
  const offer = await page.getByRole('textbox', { name: '本机连接码' }).inputValue();
  await receiver.getByRole('textbox', { name: '对方连接码' }).fill(offer);
  await receiver.getByRole('button', { name: '使用对方连接码' }).click();
  await receiver.getByRole('textbox', { name: '本机连接码' }).waitFor();
  await page
    .getByRole('textbox', { name: '对方连接码' })
    .fill(await receiver.getByRole('textbox', { name: '本机连接码' }).inputValue());
  await page.getByRole('button', { name: '使用对方连接码' }).click();
  await page.getByRole('button', { name: /发送选中的\s*1\s*首歌曲/ }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /发送选中的\s*1\s*首歌曲/ }).click();
  await receiver
    .getByRole('button', { name: '接收选中的歌曲', exact: true })
    .click({ timeout: 30000 });
  await receiver
    .getByRole('button', { name: '接收并导入', exact: true })
    .waitFor({ timeout: 120000 });
  await receiver.getByRole('button', { name: '接收并导入', exact: true }).click();
  await receiver.waitForFunction(
    async ({ title, expected }) => {
      const library = await window.jam.call('library');
      return library.some(
        (p) =>
          p.title === title &&
          p.tracks.length === 6 &&
          (!expected || p.results?.length === expected),
      );
    },
    { title: testTitle, expected: Number(process.env.TEST_EXPECT_RESULTS) || 0 },
  );
  console.log('WebRTC file transfer and SHA-256 import passed');
  await page.getByRole('button', { name: '结束本次互传', exact: true }).click();
})()
  .catch(async (e) => {
    console.error(e);
    for (let i = 0; i < apps.length; i++) {
      const p = apps[i].windows()[0];
      await p?.screenshot({ path: 'test-output/failure-' + i + '.png' }).catch(() => {});
      console.log(
        'Window',
        i,
        await p?.locator('.modal-heading h2').allTextContents(),
        'Remote panels',
        await p?.locator('.remote-transfer').count(),
      );
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const app of apps.reverse()) await app.close().catch(() => {});
  });
