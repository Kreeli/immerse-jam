const { _electron: electron } = require('playwright');
const path = require('node:path'),
  assert = require('node:assert/strict');
const { createInteractionFixture } = require('./fixtures.cjs');
const { createSession } = require('../desktop/sessions.cjs');
const { data, store, p } = createInteractionFixture(15);
p.tracks.forEach((track, i) => {
  track.mute = i !== 0;
});
p.results.find((result) => result.id === p.activeResultId).tracks = structuredClone(p.tracks);
store.save(p);
const practice = createSession(store, { kind: 'practice', sourceId: p.id, title: '审查跟练' });
let app, page;
const wait = (ms) => page.waitForTimeout(ms);
async function range(value) {
  await page.getByRole('slider', { name: '播放进度', exact: true }).evaluate((el, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      el,
      String(value),
    );
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
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
      IMMERSE_PROFILE_DIR: path.join(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.evaluate(() => {
    const Original = window.AudioContext,
      connect = AudioNode.prototype.connect;
    window.__dspNodes = new Set();
    window.__blocks = [];
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        window.__ctx = this;
      }
    };
    AudioNode.prototype.connect = function (...args) {
      if (args[0] instanceof AudioWorkletNode) window.__dspNodes.add(args[0]);
      if (this instanceof DynamicsCompressorNode && args[0] instanceof GainNode) {
        const master = args[0],
          ctx = this.context,
          capture = ctx.createScriptProcessor(256, 2, 1),
          zero = ctx.createGain();
        zero.gain.value = 0;
        capture.onaudioprocess = (event) => {
          const input = event.inputBuffer.getChannelData(0);
          let sum = 0;
          for (const v of input) sum += v * v;
          window.__blocks.push({ time: ctx.currentTime, rms: Math.sqrt(sum / input.length) });
        };
        connect.call(master, capture);
        connect.call(capture, zero);
        connect.call(zero, ctx.destination);
      }
      return connect.apply(this, args);
    };
  });
  await page.getByRole('button', { name: '默认分类', exact: true }).waitFor();
  const order = await page
    .locator('.sidebar-bottom')
    .evaluate((el) => [...el.children].map((child) => child.className));
  assert.deepEqual(order.slice(0, 3), ['local-note', 'feedback-button', 'donate']);
  assert.ok(await page.getByRole('button', { name: '请作者喝一瓶冰可乐', exact: false }).count());
  await page.locator('.song-info').filter({ hasText: '交互验收' }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  assert.equal(await page.locator('.transport-record').count(), 0);
  for (const kind of ['跟练', '创作']) {
    await page.getByRole('button', { name: '以这首歌创建', exact: true }).click();
    await page
      .locator('.create-song-menu')
      .getByRole('button', { name: kind, exact: true })
      .click();
    assert.equal(
      await page.getByRole('combobox', { name: '音乐库歌曲', exact: true }).inputValue(),
      p.id,
    );
    assert.equal(
      await page.getByRole('combobox', { name: '使用分离结果', exact: true }).inputValue(),
      p.activeResultId,
    );
    await page.getByRole('button', { name: '取消', exact: true }).click();
  }
  assert.equal(store.list().length, 2, 'cancel never creates content');
  await page.getByRole('button', { name: '和弦', exact: true }).click();
  await page.getByRole('button', { name: '新建自制谱', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="当前和弦谱"]').value !== 'auto',
  );
  await page.getByRole('button', { name: '删除和弦谱', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(store.get(p.id).chordCharts.length, 1);
  await page.getByRole('button', { name: '删除和弦谱', exact: true }).click();
  await page
    .getByRole('dialog', { name: '删除和弦谱', exact: true })
    .getByRole('button', { name: '删除', exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="当前和弦谱"]').value === 'auto',
  );
  assert.equal(store.get(p.id).chordCharts.length, 0);
  assert.equal(store.get(p.id).tracks.length, 4);
  await page.getByRole('button', { name: '跟练/创作', exact: true }).click();
  await page.getByRole('button', { name: '打开 审查跟练', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await range(1.1);
  await page.getByRole('button', { name: '设置循环段落开始', exact: true }).click();
  await range(1.573);
  await page.getByRole('button', { name: '设置循环段落结束', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await wait(2200);
  const sound = await page.evaluate(() => {
    const blocks = window.__blocks.filter((b) => b.time > window.__ctx.currentTime - 1.3);
    let silent = 0,
      longest = 0;
    for (const b of blocks) {
      silent = b.rms < 0.003 ? silent + 256 / 48000 : 0;
      longest = Math.max(longest, silent);
    }
    return {
      longestSilence: longest,
      peakRms: Math.max(...blocks.map((b) => b.rms)),
      dspNodes: window.__dspNodes.size,
    };
  });
  assert.ok(sound.peakRms > 0.03, JSON.stringify(sound));
  assert.ok(sound.longestSilence < 0.035, JSON.stringify(sound));
  assert.equal(sound.dspNodes, 1, 'one DSP survives loads and loops');
  for (let i = 0; i < 12; i++) await range(1.2 + (i % 3) * 0.07);
  await wait(350);
  assert.equal(
    await page.getByRole('button', { name: '暂停', exact: true }).count(),
    1,
    'rapid seeks keep playing',
  );
  assert.equal(await page.evaluate(() => window.__dspNodes.size), 1);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('审查测试：拒绝录音权限', 'NotAllowedError');
    };
  });
  await page.getByRole('button', { name: '练琴录音', exact: true }).click();
  await page.getByRole('button', { name: '伴奏继续并开始录音', exact: true }).click();
  await page.getByText('审查测试：拒绝录音权限', { exact: false }).waitFor();
  await page.getByRole('button', { name: '关闭录音窗口', exact: true }).click();
  await wait(950);
  const position = Number(
    await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue(),
  );
  assert.ok(
    position >= 1.1 && position < 1.573,
    'permission failure preserves active loop: ' + position,
  );
  assert.equal(store.get(practice.id).bookmarks.filter((mark) => mark.end).length, 1);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: 'test-output/v018-review.png' });
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
  await page.waitForFunction(() => window.__ctx.state === 'closed');
  assert.deepEqual(errors, []);
  console.log(
    'REVIEW_CHECK_PASSED',
    JSON.stringify({
      sound,
      position,
      permissionLoopPreserved: true,
      rapidSeek: true,
      sourceCreation: true,
      chartDeletion: true,
      contextClosed: true,
      errors,
    }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    await page?.screenshot({ path: 'test-output/v018-review-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
