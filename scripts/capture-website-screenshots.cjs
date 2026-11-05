// Refresh public screenshots from the current shared application UI and licensed demo assets.
const { chromium } = require('playwright');
const { server } = require('./preview-website.cjs');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const out = path.resolve('docs/site/assets');
let browser, page;
async function shot(name) {
  if (await page.locator('.play-main').count()) await loaded();
  if (await page.locator('.toast button').count())
    await page.locator('.toast button').first().click();
  await page.mouse.move(-10, -10);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(out, name + '.png') });
  const png = fs.readFileSync(path.join(out, name + '.png'));
  const html = path.resolve('docs/site/index.html');
  fs.writeFileSync(
    html,
    fs
      .readFileSync(html, 'utf8')
      .replace(new RegExp('<img\\b(?=[^>]*\\bsrc="assets/' + name + '\\.png")[^>]*>', 'g'), (tag) =>
        tag
          .replace(/\bwidth="\d+"/, 'width="' + png.readUInt32BE(16) + '"')
          .replace(/\bheight="\d+"/, 'height="' + png.readUInt32BE(20) + '"'),
      ),
  );
  console.log('Captured ' + name);
}
async function fitCreation() {
  await page
    .locator('.source-object')
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(250);
  const take = await page.locator('.take-object').first().boundingBox(),
    transport = await page.locator('.transport,.mobile-transport').boundingBox();
  const extra = Math.max(0, Math.ceil(take.y + take.height - transport.y) + 20);
  if (extra) {
    const size = page.viewportSize();
    await page.setViewportSize({ width: size.width, height: size.height + extra });
  }
}
async function loaded() {
  await page.waitForFunction(
    () => document.querySelector('.play-main') && !document.querySelector('.play-main').disabled,
  );
}
async function create() {
  await page.getByRole('button', { name: '新建创作', exact: true }).click();
  await page
    .locator('.session-create-dialog')
    .getByRole('button', { name: '创建', exact: true })
    .click();
  await page.getByRole('button', { name: '添加分轨项目', exact: true }).click();
  await page
    .locator('.source-group-dialog')
    .getByRole('button', { name: '添加', exact: true })
    .click();
  await loaded();
  await page.getByRole('button', { name: '导入音频', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.take-object'));
  // Keep the recording compact so the group, its children and recording controls all fit.
  const takeExpand = page.locator('.take-object .object-expand').first();
  if ((await takeExpand.getAttribute('aria-expanded')) === 'true') await takeExpand.click();
  await page.locator('.source-object .object-expand').first().click();
  await page.getByRole('button', { name: '显示所有音轨', exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('.source-object .waveform')?.dataset.peakMax) > 0,
  );
  assert.equal(await page.locator('.source-object > .creation-object-heading .nr-pan').count(), 1);
  assert.equal(await page.locator('.source-stems-toggle small').count(), 0);
}
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    args: ['--mute-audio'],
  });
  const base = 'http://127.0.0.1:' + server.address().port + '/immerse-jam/tryout/index.html';
  for (const android of [false, true]) {
    const context = await browser.newContext({
      viewport: android ? { width: 1232, height: 800 } : { width: 1584, height: 1058 },
      deviceScaleFactor: android ? 2 : 1,
      hasTouch: android,
    });
    await context.addInitScript(() =>
      localStorage.setItem(
        'immerse.preferences',
        JSON.stringify({ language: 'zh-CN', theme: 'dark', accent: 'rose' }),
      ),
    );
    page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(base + (android ? '?platform=android' : ''));
    await page.addStyleTag({
      content:
        '.demo-banner,.demo-notice{display:none!important}.demo-desktop{height:100dvh!important;min-width:0!important}.demo-desktop .app{height:100dvh!important}',
    });
    await loaded();
    if (!android) {
      await page
        .getByRole('button', { name: /^(拆分音轨|开始分析)$/ })
        .first()
        .click();
      await page
        .locator('.modal-actions')
        .getByRole('button', { name: '开始分析', exact: true })
        .click();
      await page.waitForFunction(
        async () => (await window.jam.call('library'))[0].tracks.length === 6,
      );
      await page.locator('.task-status').waitFor({ state: 'hidden' });
      await loaded();
      await page.getByRole('button', { name: '音乐库', exact: true }).click();
      await page.waitForFunction(
        () => document.querySelectorAll('.nr-song .nr-stems i').length === 6,
      );
      await shot('Win_home');
      await page.getByRole('button', { name: '设置与模型', exact: true }).click();
      await page.locator('.model-list').waitFor();
      await page.locator('.model-list').scrollIntoViewIfNeeded();
      await shot('Win_model');
      await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
      await page.locator('.nr-open-hit').first().click();
      await loaded();
      await page.getByRole('button', { name: '以这首歌创建', exact: true }).click();
      await page.getByRole('menuitem', { name: '跟练', exact: true }).click();
      await page
        .locator('.session-create-dialog')
        .getByRole('button', { name: /创建|开始跟练/ })
        .click();
      await loaded();
      await page.getByRole('button', { name: '练琴录音', exact: true }).click();
      await page
        .getByRole('button', { name: /开始录音|开始录制|立即录音/ })
        .last()
        .click();
      await page.waitForTimeout(2400);
      await page.getByRole('button', { name: '停止并保存', exact: true }).click();
      await page
        .getByRole('button', { name: '停止并保存', exact: true })
        .waitFor({ state: 'hidden' });
      await loaded();
      await page.waitForFunction(
        () =>
          Number(document.querySelector('.practice-recording-waves .waveform')?.dataset.peakCount) >
          0,
      );
      await shot('Win_practice');
      await page.getByRole('button', { name: '音乐库', exact: true }).click();
      await create();
      await page.setViewportSize({ width: 1584, height: 1250 });
      await fitCreation();
      await shot('Win_create');
    } else {
      await page.waitForFunction(
        () => Number(document.querySelector('.waveform')?.dataset.peakMax) > 0,
      );
      await shot('android_wave');
      await page.getByRole('tab', { name: '和弦', exact: true }).click();
      await shot('android_chord');
      await page.getByRole('tab', { name: '波形', exact: true }).click();
      await page.getByRole('button', { name: '打开控制台', exact: true }).click();
      await shot('android_control');
      await page.getByRole('button', { name: '关闭控制台', exact: true }).click();
      await page.getByRole('button', { name: '返回列表', exact: true }).click();
      await shot('android_home');
      await create();
      await page.setViewportSize({ width: 1232, height: 1020 });
      await fitCreation();
      await shot('android_create');
    }
    await context.close();
  }
  console.log('WEBSITE_SCREENSHOTS_REFRESHED');
})()
  .catch(async (error) => {
    await page?.screenshot({ path: 'test-output/website-capture-failed.png' }).catch(() => {});
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
