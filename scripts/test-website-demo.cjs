const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { server } = require('./preview-website.cjs');
const path = require('node:path');
const fs = require('node:fs');
async function main() {
  fs.mkdirSync(path.resolve('test-output'), { recursive: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(response.status() + ' ' + response.url());
    });
    await page.addInitScript(() => {
      window.__microphoneCalls = 0;
      navigator.mediaDevices.getUserMedia = async () => {
        window.__microphoneCalls++;
        throw new Error('Demo must not request hardware');
      };
    });
    const base = `http://127.0.0.1:${server.address().port}/immerse-jam/`;
    await page.goto(base + 'tryout/index.html');
    await page
      .getByRole('button', { name: /^(拆分音轨|开始分析)$/ })
      .first()
      .click();
    await page
      .locator('.modal-actions')
      .getByRole('button', { name: '开始分析', exact: true })
      .click();
    await page
      .locator('.job-panel')
      .waitFor({ state: 'hidden' })
      .catch(() => {});
    await page.waitForFunction(
      async () => (await window.jam.call('library'))[0].tracks.length === 6,
    );
    await page.getByRole('button', { name: '播放', exact: true }).click();
    await page.waitForTimeout(1100);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    assert.ok(
      Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) > 0.1,
      'Audio playback must advance',
    );
    const guitar = page
      .locator('.track-control')
      .filter({ has: page.getByRole('button', { name: '显示吉他波形', exact: true }) });
    await guitar.getByRole('button', { name: '关闭声音', exact: true }).click();
    await page.waitForFunction(
      async () =>
        (await window.jam.call('library'))[0].tracks.find((t) => t.name === 'guitar').mute,
    );
    await page.getByRole('button', { name: '以这首歌创建', exact: true }).click();
    await page.getByRole('button', { name: '跟练', exact: true }).click();
    await page
      .locator('.session-create')
      .getByRole('button', { name: /创建|开始跟练/ })
      .click();
    await page.getByRole('button', { name: '练琴录音', exact: true }).waitFor();
    await page.screenshot({ path: 'test-output/website-demo-practice.png' });
    await page.getByRole('button', { name: '练琴录音', exact: true }).click();
    // Complete the same start/stop workflow as the PC application, using simulated input.
    const start = page.getByRole('button', { name: /开始录音|开始录制|立即录音/, exact: false });
    await start.last().click();
    await page.waitForTimeout(1400);
    await page.getByRole('button', { name: '停止并保存', exact: true }).click();
    await page.waitForFunction(async () =>
      (await window.jam.call('library')).some((p) => p.kind === 'practice' && p.takes.length === 1),
    );
    await page
      .getByRole('button', { name: '停止并保存', exact: true })
      .waitFor({ state: 'hidden' });
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'test-output/website-demo-recording.png' });
    assert.equal(await page.evaluate(() => window.__microphoneCalls), 0);
    await page.getByRole('button', { name: '和弦', exact: true }).click();
    await page.getByRole('button', { name: /^新建自制(和弦)?谱$/ }).click();
    await page.getByRole('textbox', { name: '和弦谱名称', exact: true }).fill('我的演示和弦谱');
    await page.waitForFunction(async () =>
      (await window.jam.call('library')).some((p) => p.chordCharts.length > 0),
    );
    await page.getByRole('button', { name: '乐谱', exact: true }).click();
    await page.getByRole('button', { name: '导入乐谱', exact: true }).click();
    await page.getByText('乐谱已展开，可自动对齐', { exact: true }).waitFor();
    await page.getByRole('button', { name: '自动对齐原曲', exact: true }).click();
    await page.waitForFunction(async () =>
      (await window.jam.call('library')).some((p) => p.alignment),
    );
    await page.getByRole('button', { name: '音乐库', exact: true }).click();
    await page.getByRole('button', { name: '新建创作', exact: true }).click();
    await page
      .locator('.session-create')
      .getByRole('button', { name: '创建', exact: true })
      .click();
    await page.waitForFunction(async () =>
      (await window.jam.call('library')).some((p) => p.kind === 'creation'),
    );
    await page.getByRole('button', { name: '添加分轨项目', exact: true }).click();
    await page
      .locator('.source-group-dialog')
      .getByRole('button', { name: '添加', exact: true })
      .click();
    await page.waitForFunction(
      async () =>
        (await window.jam.call('library')).find((p) => p.kind === 'creation').sourceGroups
          .length === 1,
    );
    assert.deepEqual(errors, []);
    await page.goto(base + 'index.html');
    assert.equal(await page.locator('#tryout-mount iframe').count(), 0);
    await page.locator('#tryout-start').click();
    await page
      .frameLocator('#tryout-mount iframe')
      .getByRole('button', { name: /^(拆分音轨|开始分析)$/ })
      .waitFor();
    await page.waitForLoadState('networkidle');
    await page.locator('#tryout').screenshot({ path: 'test-output/website-demo-embedded.png' });
    await page.locator('#tryout-close').click();
    assert.equal(await page.locator('#tryout-mount iframe').count(), 0);
    for (const width of [1440, 1024, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Homepage overflow at ' + width,
      );
    }
    console.log(
      'PASS: analysis, audible playback timeline, mute, practice, recorded fixture, chord editing, score rendering/alignment, creation groups, no microphone, lazy iframe lifecycle, responsive host.',
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
