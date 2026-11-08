const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { server } = require('./preview-website.cjs');
const path = require('node:path');
const fs = require('node:fs');
const appreciationCode = fs.readFileSync('docs/site/assets/author-appreciation.png');
async function checkAppreciationCode(page, name) {
  const image = page.getByRole('img', { name, exact: true });
  await image.scrollIntoViewIfNeeded();
  const url = await image.evaluate((el) => el.currentSrc || el.src);
  const response = await page.request.get(url);
  assert.ok(response.ok());
  assert.deepEqual(await response.body(), appreciationCode);
}
async function main() {
  fs.mkdirSync(path.resolve('test-output'), { recursive: true });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
    await page.goto(base);
    await page.locator('#appreciation summary').click();
    await checkAppreciationCode(page, '作者微信赞赏码，查看原图');
    await page.goto(base + 'tryout/index.html');
    await page.getByRole('button', { name: '请作者喝一瓶冰可乐', exact: true }).click();
    await checkAppreciationCode(page, '作者微信赞赏码');
    await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
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
    await page.getByRole('menuitem', { name: '跟练', exact: true }).click();
    await page
      .locator('.session-create-dialog')
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
    await page.getByRole('button', { name: '当前和弦谱', exact: true }).click();
    await page.getByRole('menuitem', { name: '新建和弦谱', exact: true }).click();
    await page.getByRole('textbox', { name: '和弦谱名称', exact: true }).fill('我的演示和弦谱');
    await page
      .locator('.mobile-chart-create')
      .getByRole('button', { name: '创建', exact: true })
      .click();
    await page.waitForFunction(async () =>
      (await window.jam.call('library')).some((p) => p.chordCharts.length > 0),
    );
    await page.getByRole('button', { name: '乐谱', exact: true }).click();
    await page.getByRole('button', { name: '选择乐谱 / MIDI', exact: true }).click();
    await page.getByRole('menuitem', { name: '导入乐谱', exact: true }).click();
    await page.getByText('乐谱已展开，可自动对齐', { exact: true }).waitFor();
    await page.getByRole('button', { name: '自动对齐原曲', exact: true }).click();
    await page.waitForFunction(async () =>
      (await window.jam.call('library')).some((p) => p.alignment),
    );
    await page.getByRole('button', { name: '音乐库', exact: true }).click();
    await page.getByRole('button', { name: '新建创作', exact: true }).click();
    await page
      .locator('.session-create-dialog')
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
    const androidContext = await browser.newContext({
      viewport: { width: 985, height: 680 },
      hasTouch: true,
    });
    const android = await androidContext.newPage();
    android.on('pageerror', (error) => errors.push(error.message));
    await android.goto(base + 'tryout/index.html?platform=android');
    await android.getByRole('button', { name: '设置', exact: true }).click();
    await android.getByRole('button', { name: '请作者喝一瓶冰可乐', exact: true }).click();
    await checkAppreciationCode(android, '作者微信赞赏码');
    await android.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await android.getByRole('button', { name: '播放', exact: true }).click();
    const androidSeek = android.getByRole('slider', { name: '播放进度', exact: true });
    await androidSeek.evaluate((slider) => {
      window.__seekFrames = [];
      slider.addEventListener(
        'pointerup',
        () => {
          const draw = () => {
            window.__seekFrames.push(Number(slider.value));
            if (window.__seekFrames.length < 12) requestAnimationFrame(draw);
          };
          requestAnimationFrame(draw);
        },
        { once: true },
      );
    });
    const androidSeekBounds = await androidSeek.boundingBox();
    await androidSeek.tap({
      position: { x: androidSeekBounds.width * 0.6, y: androidSeekBounds.height * 0.5 },
    });
    await android.waitForFunction(() => window.__seekFrames.length === 12);
    const seekFrames = await android.evaluate(() => window.__seekFrames);
    assert.ok(
      seekFrames.every((value) => value >= 35),
      JSON.stringify(seekFrames),
    );
    assert.ok(seekFrames.at(-1) > seekFrames[0], 'Audio must continue at the touch target');
    await androidSeek.focus();
    await android.keyboard.press('Space');
    await android.getByRole('button', { name: '播放', exact: true }).waitFor();
    assert.equal(await androidSeek.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
    assert.ok(Number(await androidSeek.inputValue()) >= seekFrames.at(-1));
    await android.keyboard.press('Space');
    await android.getByRole('button', { name: '暂停', exact: true }).waitFor();
    await android.keyboard.press('Space');
    await android.getByRole('button', { name: '播放', exact: true }).waitFor();
    await android.getByRole('button', { name: '返回列表', exact: true }).click();
    await android.getByRole('button', { name: '新建创作', exact: true }).click();
    await android
      .locator('.session-create-dialog')
      .getByRole('button', { name: '创建', exact: true })
      .click();
    await android.getByRole('button', { name: '添加分轨项目', exact: true }).click();
    await android
      .locator('.source-group-dialog')
      .getByRole('button', { name: '添加', exact: true })
      .click();
    const androidGroup = android.locator('.source-object').first();
    assert.equal(
      await androidGroup.locator(':scope > .creation-object-heading .nr-pan').count(),
      1,
    );
    assert.equal(
      await androidGroup.locator(':scope > .creation-object-heading [role="meter"]').count(),
      1,
    );
    await androidGroup.locator('.object-expand').click();
    await androidGroup.getByRole('button', { name: '显示所有音轨', exact: true }).click();
    assert.equal(await androidGroup.locator('.source-stems-toggle small').count(), 0);
    await android.waitForFunction(
      () => Number(document.querySelector('.source-object .waveform')?.dataset.peakMax) > 0,
    );
    const originalPeak = Number(
      await androidGroup.locator('.waveform').first().getAttribute('data-peak-max'),
    );
    const androidGain = androidGroup
      .locator(':scope > .creation-object-heading .nr-strip-ctl input')
      .first();
    await androidGain.focus();
    await android.keyboard.press('Home');
    for (let i = 0; i < 40; i++) await android.keyboard.press('ArrowRight');
    assert.ok(
      Number(await androidGroup.locator('.waveform').first().getAttribute('data-peak-count')) > 0,
    );
    await android.waitForFunction(
      (peak) =>
        Math.abs(
          Number(document.querySelector('.source-object .waveform')?.dataset.peakMax) - peak * 0.4,
        ) < 0.005,
      originalPeak,
    );
    const androidStem = androidGroup.locator('.source-stem-row').first();
    await androidStem.locator('.track-name').click();
    assert.equal(
      await androidStem.locator('.nr-strip').evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgba(0, 0, 0, 0)',
    );
    for (const width of [985, 412]) {
      await android.setViewportSize({ width, height: 800 });
      assert.ok(
        await android.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      );
      const meter = await androidStem.locator('.nr-live-meter').boundingBox(),
        body = await androidStem.locator('.nr-strip-body').boundingBox();
      assert.ok(meter.x >= body.x + body.width, 'Android stem meter stays on the right');
    }
    await androidContext.close();
    assert.deepEqual(errors, []);
    await page.goto(base + 'index.html');
    assert.equal(await page.locator('#tryout-mount iframe').count(), 0);
    await page.getByRole('button', { name: 'Android', exact: true }).click();
    assert.ok(
      (await page.locator('#tryout-launch img').getAttribute('src')).endsWith('android_create.png'),
    );
    await page.locator('#tryout-start').click();
    await page
      .frameLocator('#tryout-mount iframe')
      .getByRole('button', { name: '打开控制台', exact: true })
      .waitFor();
    await page.locator('#tryout-close').click();
    assert.equal(await page.locator('#tryout-mount iframe').count(), 0);
    await page.getByRole('button', { name: 'Windows', exact: true }).click();
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
  } catch (error) {
    await page?.screenshot({ path: 'test-output/website-demo-failed.png' }).catch(() => {});
    throw error;
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
