const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path'),
  fs = require('node:fs');
const { createInteractionFixture } = require('./fixtures.cjs');
const { createSession } = require('../desktop/sessions.cjs');
const { Folders } = require('../desktop/folders.cjs');
const { choose } = require('./ui-gestures.cjs');
const f = createInteractionFixture(3),
  { store, data, p } = f;
const practice = createSession(store, { kind: 'practice', sourceId: p.id, title: '跟练示例' });
const creation = createSession(store, { kind: 'creation', title: '创作示例' });
for (let i = 0; i < 26; i++) store.create(store.asset(p.id, p.original), '界面示例 ' + i);
const folders = new Folders(store);
const folder = folders
  .edit({ action: 'create', name: '排练分类' })
  .find((x) => x.name === '排练分类');
for (const project of [p, practice, creation])
  folders.edit({ action: 'move', id: folder.id, projectId: project.id });
let app, page;
const button = (name) => page.getByRole('button', { name, exact: true });
const out = path.resolve('test-output/pc-browse-review');
fs.mkdirSync(out, { recursive: true });
(async () => {
  app = await electron.launch({
    executablePath: process.env.TEST_PACKAGED
      ? path.resolve('release/win-unpacked/Immerse Jam.exe')
      : require('electron'),
    args: process.env.TEST_PACKAGED ? ['--mute-audio'] : ['.', '--mute-audio'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.join(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
      IMMERSE_LOCALE: 'zh-CN',
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('.library-page .nr-song').first().waitFor();
  const reports = [];
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') {
      await button('设置与模型').click();
      await page.getByRole('combobox', { name: '明暗主题', exact: true }).selectOption('light');
      await button('关闭窗口').click();
    }
    for (const width of [1920, 1440, 1024]) {
      await page.setViewportSize({ width, height: width === 1024 ? 700 : 1000 });
      await button('音乐库').click();
      await choose(page, '显示布局', 'grid');
      const row = await page.locator('.library-tools').evaluate((e) =>
        [...e.children]
          .filter((e) => e.getBoundingClientRect().width)
          .map((e) => {
            const r = e.getBoundingClientRect();
            return {
              class: e.className,
              x: r.x,
              y: r.y,
              width: r.width,
              height: r.height,
              right: r.right,
            };
          }),
      );
      const centers = row.map((r) => r.y + r.height / 2);
      assert.ok(Math.max(...centers) - Math.min(...centers) < 3, JSON.stringify(row));
      const libraryCard = await page.locator('.library-page .nr-song').first().boundingBox();
      assert.ok(
        (await page.getByRole('combobox', { name: '显示布局', exact: true }).boundingBox()).width <
          150,
      );
      await page.screenshot({ path: path.join(out, `library-${theme}-${width}.png`) });
      await button('排练分类').click();
      await page.locator('.folder-page .nr-song').first().waitFor();
      const folderCard = await page.locator('.folder-page .nr-song').first().boundingBox();
      assert.ok(
        Math.abs(folderCard.width - libraryCard.width) < 1,
        JSON.stringify({ libraryCard, folderCard }),
      );
      assert.ok(
        Math.abs(folderCard.height - libraryCard.height) < 1,
        JSON.stringify({ libraryCard, folderCard }),
      );
      const filter = await page
        .getByRole('combobox', { name: '内容类型', exact: true })
        .boundingBox();
      assert.ok(filter.width >= 100 && filter.x + filter.width <= width);
      assert.equal(await page.locator('.folder-page .library-header button').count(), 0);
      await choose(page, '内容类型', 'creation');
      assert.equal(await page.locator('.folder-page .nr-song').count(), 1);
      await choose(page, '内容类型', 'all');
      await page.screenshot({ path: path.join(out, `folder-${theme}-${width}.png`) });
      await button('设备互传').click();
      await page.locator('.transfer-dialog').waitFor();
      await page.locator('.transfer-dialog').evaluate((e) => (e.scrollTop = e.scrollHeight));
      const close = button('关闭窗口');
      const hit = await close.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      assert.ok(hit, 'Transfer close button must remain reachable after scrolling');
      await close.click();
      await page.locator('.transfer-dialog').waitFor({ state: 'hidden' });
      assert.ok(await page.evaluate(() => document.body.scrollWidth <= innerWidth + 1));
      reports.push({
        theme,
        width,
        card: { width: folderCard.width, height: folderCard.height },
        filterWidth: filter.width,
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await button('管理分类 排练分类').click();
  await page.getByRole('menuitem', { name: '编辑分类', exact: true }).click();
  await page
    .getByRole('dialog', { name: '编辑分类', exact: true })
    .getByRole('textbox', { name: '分类名称', exact: true })
    .fill('周末排练');
  await page
    .getByRole('dialog', { name: '编辑分类', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await page.getByRole('heading', { name: /周末排练/ }).waitFor();
  await button('管理分类 周末排练').click();
  await page.getByRole('menuitem', { name: '删除分类', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除分类', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  assert.equal(folders.list().length, 1);
  await button('管理分类 周末排练').click();
  await page.getByRole('menuitem', { name: '删除分类', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除分类', exact: true })
    .getByRole('button', { name: '删除分类', exact: true })
    .click();
  await page.getByRole('heading', { name: /默认分类/ }).waitFor();
  assert.equal(store.list().length, 29);
  assert.equal(folders.list().length, 0);
  await button('新建分类').click();
  await page
    .getByRole('dialog', { name: '新建分类', exact: true })
    .getByRole('textbox', { name: '分类名称', exact: true })
    .fill('新分类');
  await page
    .getByRole('dialog', { name: '新建分类', exact: true })
    .getByRole('button', { name: '保存', exact: true })
    .click();
  await button('新分类').waitFor();
  await button('音乐库').click();
  await button('打开 交互验收').click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).check();
  assert.equal(await page.getByRole('spinbutton', { name: '预备拍 BPM', exact: true }).count(), 0);
  await choose(page, '预备拍拍数', '6');
  assert.equal(
    await page
      .getByRole('combobox', { name: '预备拍拍数', exact: true })
      .evaluate((e) => e.tagName),
    'BUTTON',
  );
  await page.screenshot({ path: path.join(out, 'count-in.png') });
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).uncheck();
  await button('播放').click();
  await button('设备互传').click();
  await button('生成配对二维码').click();
  await page.locator('.pair-box').waitFor();
  await page.locator('.transfer-dialog').evaluate((e) => (e.scrollTop = e.scrollHeight));
  await button('关闭窗口').click();
  await page.locator('.transfer-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.play-main').getAttribute('aria-label'), '暂停');
  await button('暂停').click();
  await button('设备互传').click();
  assert.equal(await page.locator('.pair-box').count(), 0);
  await button('关闭窗口').click();
  assert.deepEqual(errors, []);
  console.log('DESKTOP_BROWSE_CHECK_PASSED', JSON.stringify(reports));
})()
  .catch(async (e) => {
    console.error(e);
    await page?.screenshot({ path: path.join(out, 'failed.png') }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => app?.close());
