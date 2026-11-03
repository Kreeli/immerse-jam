const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { server } = require('./preview-website.cjs');
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    args: ['--mute-audio'],
  });
  const errors = [];
  const out = 'test-output/ui-recheck';
  fs.mkdirSync(out, { recursive: true });
  const base = `http://127.0.0.1:${server.address().port}/immerse-jam/`;
  try {
    const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
    p.on('pageerror', (e) => errors.push(e.message));
    await p.goto(base + 'tryout/index.html');
    await p.waitForFunction(() => !document.querySelector('.play-main')?.disabled);
    await p.getByRole('button', { name: '附件', exact: true }).click();
    await p.getByRole('button', { name: '选择附件', exact: true }).click();
    await p.getByRole('menuitem', { name: '添加附件', exact: true }).click();
    await p.getByRole('button', { name: '选择附件', exact: true }).click();
    await p.getByRole('menuitem', { name: /删除附件/ }).click();
    await p.locator('.metadata-dialog').getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(
      await p.evaluate(async () => (await window.jam.call('library'))[0].attachments.length),
      1,
    );
    await p.getByRole('button', { name: '乐谱', exact: true }).click();
    await p.getByRole('button', { name: '选择乐谱 / MIDI', exact: true }).click();
    await p.screenshot({ path: out + '/attachment-menu.png' });
    await p.getByRole('menuitem', { name: /删除附件/ }).click();
    await p.locator('.metadata-dialog').getByRole('button', { name: '删除', exact: true }).click();
    await p.waitForFunction(
      async () => (await window.jam.call('library'))[0].attachments.length === 0,
    );
    await p.getByRole('button', { name: '波形', exact: true }).click();
    await p.getByRole('button', { name: '拆分音轨', exact: true }).click();
    await p
      .locator('.modal-actions')
      .getByRole('button', { name: '开始分析', exact: true })
      .click();
    await p.waitForFunction(() => document.querySelectorAll('.nr-strip').length === 6);
    await p.locator('.app').screenshot({ path: out + '/windows-wave.png' });
    await p.getByRole('button', { name: '以这首歌创建', exact: true }).click();
    await p.getByRole('menuitem', { name: '创作', exact: true }).click();
    await p
      .locator('.session-create-dialog')
      .getByRole('button', { name: '创建', exact: true })
      .click();
    await p.getByRole('button', { name: '导入音频', exact: true }).click();
    await p.locator('.take-object').waitFor();
    await p
      .locator('.take-object')
      .getByRole('button', { name: /重命名音轨/ })
      .click();
    await p.getByRole('textbox', { name: '音轨名称', exact: true }).fill('演奏录音 · 吉他');
    await p.screenshot({ path: out + '/rename-dialog.png' });
    await p.locator('.metadata-dialog').getByRole('button', { name: '保存', exact: true }).click();
    assert.equal(await p.locator('.track-rename').count(), 0);
    await p
      .locator('.take-object')
      .getByRole('button', { name: '移回录音库', exact: true })
      .click();
    await p.locator('.take-object').waitFor({ state: 'hidden' });
    await p.getByRole('button', { name: /^录音库/ }).click();
    await p.getByRole('button', { name: '加入音轨', exact: true }).click();
    await p
      .locator('.mobile-dialog, .modal')
      .getByRole('button', { name: '关闭录音窗口', exact: true })
      .click();
    await p.locator('.take-object').waitFor();
    await p.locator('.app').screenshot({ path: out + '/windows-creation.png' });
    await p.setViewportSize({ width: 1024, height: 700 });
    assert.ok(await p.evaluate(() => document.body.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: out + '/windows-narrow.png' });
    await p.getByRole('button', { name: /删除分轨项目 / }).click();
    await p.locator('.metadata-dialog').getByRole('button', { name: '删除', exact: true }).click();
    await p.locator('.source-object').waitFor({ state: 'hidden' });
    assert.equal(await p.locator('.take-object').count(), 1);
    await p.setViewportSize({ width: 412, height: 915 });
    await p.goto(base + 'tryout/index.html?platform=android');
    await p.waitForFunction(
      () =>
        document.documentElement.dataset.platform === 'android' &&
        !document.querySelector('.play-main')?.disabled &&
        !document.querySelector('.mobile-audio-loading'),
    );
    await p.locator('.app').screenshot({ path: out + '/android-wave.png' });
    for (const tab of ['和弦', '乐谱', '附件']) {
      await p.getByRole('tab', { name: tab, exact: true }).click();
      assert.ok(await p.evaluate(() => document.body.scrollWidth <= innerWidth + 1));
    }
    await p.getByRole('tab', { name: '乐谱', exact: true }).click();
    await p.getByRole('button', { name: '选择乐谱 / MIDI', exact: true }).click();
    await p.getByRole('menuitem', { name: '导入乐谱', exact: true }).click();
    await p.getByText('乐谱已展开，可自动对齐', { exact: true }).waitFor();
    await p.getByRole('button', { name: '选择乐谱 / MIDI', exact: true }).click();
    await p.getByRole('menuitem', { name: /删除附件/ }).click();
    await p.locator('.metadata-dialog').getByRole('button', { name: '删除', exact: true }).click();
    await p.waitForFunction(
      async () => (await window.jam.call('library'))[0].attachments.length === 0,
    );
    await p.getByRole('button', { name: '返回列表', exact: true }).click();
    await p.locator('.app').screenshot({ path: out + '/android-home.png' });
    await p.goto(base);
    await p.locator('[data-demo-platform="android"]').click();
    await p.locator('#tryout-start').click();
    assert.ok(
      (await p.locator('#tryout-mount iframe').getAttribute('src')).includes('platform=android'),
    );
    await p.locator('#tryout-close').click();
    assert.equal(await p.locator('#tryout-mount iframe').count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      'Content menus, rename, recording library, whole-group removal, narrow desktop and Android demo passed.',
    );
  } finally {
    await b.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  server.close();
});
