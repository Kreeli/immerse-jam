const { _electron: electron } = require('playwright'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs');
const { createInteractionFixture } = require('./fixtures.cjs');
const { data, store, p, resultB, resultA } = createInteractionFixture(20);
let app, page;
const wait = (ms) => page.waitForTimeout(ms);
async function button(name) {
  return page.getByRole('button', { name, exact: true });
}
async function ready() {
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
}
async function position() {
  return Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue());
}
async function level(name) {
  return Number(
    await page
      .getByRole('meter', { name: name + '当前声音大小', exact: true })
      .getAttribute('data-level'),
  );
}
(async () => {
  app = await electron.launch({
    executablePath: process.env.TEST_PACKAGED
      ? path.resolve('release/win-unpacked/Immerse Jam.exe')
      : require('electron'),
    args: [
      ...(process.env.TEST_PACKAGED ? [] : ['.']),
      '--mute-audio',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--use-file-for-fake-audio-capture=' + path.join(data, 'positive.wav'),
    ],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.join(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('.song-info').filter({ hasText: p.title }).click();
  await ready();
  await (await button('播放')).click();
  await wait(350);
  const before = await position();
  await (await button('跟练/创作')).click();
  await page.locator('.session-tabs').waitFor();
  await wait(400);
  assert.ok((await position()) > before + 0.2);
  assert.ok(await page.locator('.transport-project').isVisible());
  assert.equal(await page.getByText('最近练习', { exact: true }).count(), 0);
  await (await button('新建创作')).first().click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('Cancelled project');
  await page.getByRole('combobox', { name: '音乐库歌曲', exact: true }).selectOption(p.id);
  await (await button('取消')).click();
  assert.equal(store.list().length, 1);
  assert.ok((await position()) > before);
  const original = fs.readFileSync(path.join(store.dir(p.id), 'project.json'));
  await (await button('新建跟练')).first().click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('跟练验收');
  await page.getByRole('combobox', { name: '使用分离结果', exact: true }).selectOption(resultB);
  await (await button('录音含伴奏')).click();
  await (await button('创建')).click();
  await ready();
  await page.waitForFunction(() => document.querySelectorAll('.track-control').length === 6);
  let practice = store.list().find((project) => project.kind === 'practice');
  assert.equal(practice.tracks.length, 6);
  assert.equal(practice.practiceMode, 'mixed');
  assert.deepEqual(fs.readFileSync(path.join(store.dir(p.id), 'project.json')), original);
  await (await button('练琴录音')).click();
  await (await button('开始录音')).click();
  await page.locator('.recording-bar').waitFor();
  await wait(1000);
  await (await button('停止并保存')).click();
  await page.locator('.recording-bar').waitFor({ state: 'detached' });
  await ready();
  practice = store.get(practice.id);
  assert.equal(practice.takes.length, 1);
  assert.equal(practice.takes[0].mute, false);
  await page.getByRole('slider', { name: '播放进度', exact: true }).press('Home');
  await (await button('播放')).click();
  await wait(300);
  assert.ok((await level('人声')) < 1e-6, 'mixed review does not add backing');
  const name = practice.takes[0].name;
  assert.ok((await level(name)) > 0.01, 'mixed take is audible');
  await (await button('分轨伴奏')).click();
  await wait(300);
  assert.ok((await level('人声')) > 0.03, 'quick mode switch restores backing');
  await (await button('录音含伴奏')).click();
  await wait(250);
  assert.ok((await level('人声')) < 1e-6);
  await (await button('练琴录音')).click();
  if (await page.locator('.recorder-dialog').count())
    await (await button('伴奏继续并开始录音')).click();
  await page.locator('.recording-bar').waitFor();
  await wait(300);
  assert.ok((await level('人声')) > 0.03, 'recording routes backing stems');
  assert.ok((await level(name)) < 1e-6, 'previous attempt is not overdubbed in practice');
  await (await button('停止并保存')).click();
  await page.locator('.recording-bar').waitFor({ state: 'detached' });
  await ready();
  await (await button('跟练/创作')).click();
  await page.locator('.session-row').waitFor();
  await page.screenshot({ path: 'test-output/v015-practice-hub.png' });
  await (await button('新建创作')).first().click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('有源创作验收');
  await page.getByRole('combobox', { name: '音乐库歌曲', exact: true }).selectOption(p.id);
  await page.getByRole('combobox', { name: '使用分离结果', exact: true }).selectOption(resultA);
  await (await button('创建')).click();
  await ready();
  await page.waitForFunction(() => document.querySelectorAll('.source-object').length === 1);
  const creation = store.list().find((project) => project.kind === 'creation');
  assert.equal(creation.tracks.length, 4);
  assert.equal(creation.sessionSource.projectId, p.id);
  assert.equal(await page.locator('.recorder-dialog').count(), 0);
  await (await button('音乐库')).click();
  assert.equal(await page.locator('.browse-content .song').count(), 1);
  assert.ok(
    await page
      .locator('.transport-project')
      .innerText()
      .then((text) => text.includes('有源创作验收')),
  );
  await page.locator('.transport-project').click();
  await page.screenshot({ path: 'test-output/v015-sourced-creation.png' });
  await (await button('跟练/创作')).click();
  assert.equal(await page.locator('.session-row').count(), 2);
  const filters = page.getByRole('group', { name: '内容类型', exact: true });
  await filters.getByRole('button', { name: '创作', exact: true }).click();
  assert.equal(await page.locator('.session-row').count(), 1);
  await filters.getByRole('button', { name: '跟练', exact: true }).click();
  assert.equal(await page.locator('.session-row').count(), 1);
  await filters.getByRole('button', { name: '全部', exact: true }).click();
  assert.equal(await page.locator('.session-row').count(), 2);
  await page.screenshot({ path: 'test-output/v015-project-list.png' });
  await (await button('设置与模型')).click();
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await page.getByRole('combobox', { name: 'Color mode', exact: true }).selectOption('light');
  await page.getByRole('combobox', { name: 'Accent color', exact: true }).selectOption('blue');
  await (await button('Close window')).click();
  assert.ok((await page.locator('.session-table th').allTextContents()).includes('Name'));
  await page.screenshot({ path: 'test-output/v015-project-list-en-light.png' });
  await page.getByRole('button', { name: 'Open ' + practice.title, exact: true }).click();
  await ready();
  assert.ok(
    await page
      .locator('.practice-mode-control button')
      .evaluateAll((buttons) =>
        buttons.every((button) => button.scrollWidth <= button.clientWidth + 1),
      ),
    'English mode controls fit',
  );
  await page.screenshot({ path: 'test-output/v015-practice-en-light.png' });
  await (await button('Settings & models')).click();
  await page
    .getByRole('combobox', { name: 'Interface language', exact: true })
    .selectOption('zh-CN');
  await page.getByRole('combobox', { name: '明暗主题', exact: true }).selectOption('dark');
  await page.getByRole('combobox', { name: '强调色', exact: true }).selectOption('rose');
  await (await button('关闭窗口')).click();
  await (await button('跟练/创作')).click();
  await page.getByRole('button', { name: '打开 ' + creation.title, exact: true }).click();
  await ready();
  await (await button('跟练/创作')).click();
  await page.getByRole('button', { name: '删除 ' + creation.title, exact: true }).click();
  await (await button('取消')).click();
  assert.ok(store.get(creation.id));
  await page.getByRole('button', { name: '删除 ' + creation.title, exact: true }).click();
  await (await button('移至回收站')).click();
  await page.getByRole('dialog', { name: '删除确认', exact: true }).waitFor({ state: 'detached' });
  assert.equal(store.list().filter((project) => project.kind === 'creation').length, 0);
  assert.equal(await page.locator('.transport-project').count(), 0);
  assert.ok(fs.existsSync(store.asset(p.id, p.original)));
  await (await button('音乐库')).click();
  await page.getByRole('button', { name: '删除歌曲 ' + p.title, exact: true }).click();
  await (await button('移至回收站')).click();
  await page.getByRole('dialog', { name: '删除确认', exact: true }).waitFor({ state: 'detached' });
  assert.equal(store.list().filter((project) => !project.kind).length, 0);
  const surviving = store.get(practice.id);
  for (const file of [surviving.original, ...surviving.tracks.map((track) => track.file)])
    assert.ok(
      fs.existsSync(store.asset(surviving.id, file)),
      'deleting music leaves practice copies intact',
    );
  assert.deepEqual(errors, []);
  console.log(
    'SESSIONS_CHECK_PASSED',
    JSON.stringify({
      continuousBrowse: true,
      cancelCreatesNothing: true,
      practiceSourceStems: 6,
      mixedReviewRouting: true,
      liveRecordingRouting: true,
      sourcedCreationStems: 4,
      sourceUnchanged: true,
      listFilters: true,
      safeDeletion: true,
      bilingualList: true,
      errors,
    }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    await page?.screenshot({ path: 'test-output/v015-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
