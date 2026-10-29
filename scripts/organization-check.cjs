const { _electron: electron } = require('playwright'),
  assert = require('node:assert/strict'),
  path = require('node:path'),
  fs = require('node:fs');
const { createInteractionFixture } = require('./fixtures.cjs'),
  { createSession } = require('../desktop/sessions.cjs');
const { data, store, p, resultB } = createInteractionFixture(18),
  practice = createSession(store, {
    kind: 'practice',
    sourceId: p.id,
    resultId: resultB,
    title: '跟练分类',
  }),
  creation = createSession(store, { kind: 'creation', title: '创作分类' });
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
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
      IMMERSE_PROFILE_DIR: path.join(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('.song-info').waitFor();
  const fonts = await page.evaluate(() =>
    Object.fromEntries(
      ['.song-info strong', '.song-info > span', '.library-tools > span', '.library-footer'].map(
        (selector) => [
          selector,
          parseFloat(getComputedStyle(document.querySelector(selector)).fontSize),
        ],
      ),
    ),
  );
  assert.ok(
    fonts['.song-info strong'] >= 16 &&
      fonts['.song-info > span'] >= 13 &&
      fonts['.library-tools > span'] >= 13,
  );
  await button('新建分类').click();
  await page.getByRole('dialog').locator('input').fill('周末练琴');
  await button('保存').click();
  await page.waitForFunction(
    () => document.querySelector('.song .folder-picker').options.length === 2,
  );
  const id = await page.locator('.song .folder-picker option').last().getAttribute('value');
  await page.locator('.song .folder-picker').selectOption(id);
  await page.locator('.song-info').click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await button('播放').click();
  await button('跟练/创作').click();
  for (const project of [practice, creation])
    await page
      .getByRole('combobox', { name: '移动到分类 ' + project.title, exact: true })
      .selectOption(id);
  await page
    .locator('.playlist-nav')
    .getByRole('button', { name: '周末练琴', exact: true })
    .click();
  await page.waitForFunction(() => document.querySelectorAll('.folder-project').length === 3);
  assert.equal(await page.locator('.play-main').getAttribute('aria-label'), '暂停');
  await page.screenshot({ path: 'test-output/v017-folders.png' });
  await button('重命名').click();
  await page.getByRole('dialog').locator('input').fill('我的练习');
  await button('保存').click();
  await page.getByRole('heading', { name: /我的练习/ }).waitFor();
  await page.getByRole('combobox', { name: '内容类型', exact: true }).selectOption('creation');
  assert.equal(await page.locator('.folder-project').count(), 1);
  await button('删除分类').click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await page.locator('.folder-project').count(), 1);
  await button('删除分类').click();
  await page.getByRole('dialog').getByRole('button', { name: '删除分类', exact: true }).click();
  await button('默认分类').click();
  await page.getByRole('combobox', { name: '内容类型', exact: true }).selectOption('all');
  assert.equal(await page.locator('.folder-project').count(), 3);
  assert.equal(store.list().length, 3);
  assert.ok(fs.existsSync(store.asset(p.id, p.original)));
  await app.evaluate(({ shell }) => {
    global.__links = [];
    shell.openExternal = async (url) => {
      global.__links.push(url);
    };
  });
  await button('用户反馈').click();
  await page.getByRole('button', { name: /发送邮件/ }).click();
  await page.getByRole('button', { name: /前往 GitHub 反馈/ }).click();
  const links = await app.evaluate(() => global.__links);
  assert.ok(links[0].startsWith('mailto:meowmeowneko999@gmail.com'));
  assert.equal(links[1], 'https://github.com/Kreeli/immerse-jam/issues/new');
  await button('关闭窗口').click();
  await page.locator('.donate').click();
  await page.locator('.donation-qr').screenshot({ path: 'test-output/v017-qr.png' });
  const crop = await page.locator('.donation-qr').evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    overflow: getComputedStyle(element).overflow,
    naturalWidth: element.querySelector('img').naturalWidth,
  }));
  assert.equal(crop.width, crop.height);
  assert.equal(crop.overflow, 'hidden');
  assert.equal(crop.naturalWidth, 1118);
  await button('关闭窗口').click();
  await button('音乐库').click();
  for (let i = 0; i < 7; i++)
    store.create(
      store.asset(p.id, p.original),
      [
        'Autumn Leaves',
        '周末即兴练习',
        'Blue Bossa',
        'Take Five',
        '慢速练习曲',
        'Fly Me to the Moon',
        '练琴片段',
      ][i],
    );
  await page.reload();
  await page.locator('.song-info').first().waitFor();
  await page.screenshot({ path: 'test-output/v017-library.png' });
  await page.setViewportSize({ width: 1024, height: 700 });
  const footer = await page.locator('.donate').boundingBox();
  assert.ok(footer.y + footer.height <= 700, JSON.stringify(footer));
  await page.screenshot({ path: 'test-output/v017-library-compact.png' });
  assert.deepEqual(errors, []);
  console.log(
    'ORGANIZATION_CHECK_PASSED',
    JSON.stringify({
      fonts,
      mixedFolders: true,
      continuousPlayback: true,
      safeFolderDeletion: true,
      feedbackLinks: true,
      originalQrPixels: true,
      errors,
    }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    await page?.screenshot({ path: 'test-output/v017-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => app?.close());
