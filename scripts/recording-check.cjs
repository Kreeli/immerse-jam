const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { createInteractionFixture } = require('./fixtures.cjs');
const { createSession } = require('../desktop/sessions.cjs');
const { data, store, p: source } = createInteractionFixture(20);
let p = source;
p.practice = {
  ...p.practice,
  countIn: true,
  countInBeats: 2,
  metronome: true,
  metronomeVolume: 0.25,
};
store.save(p);
p = createSession(store, { kind: 'practice', sourceId: p.id, title: '录音验收' });
function wav(file, seconds) {
  const rate = 48000,
    frames = rate * seconds,
    buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF');
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(frames * 4, 40);
  for (let frame = 0; frame < frames; frame++) {
    const value = Math.round(Math.sin((frame / rate) * Math.PI * 2 * 880) * 5000);
    buffer.writeInt16LE(value, 44 + frame * 4);
    buffer.writeInt16LE(value, 46 + frame * 4);
  }
  fs.writeFileSync(file, buffer);
}
const fake = path.join(data, 'fake-input.wav');
wav(fake, 60);
const imported = [path.join(data, 'short.wav'), path.join(data, 'long.wav')];
wav(imported[0], 1);
wav(imported[1], 3);
let app, page;
const wait = (ms) => page.waitForTimeout(ms);
async function range(name, value) {
  await page.getByRole('slider', { name, exact: true }).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
      element,
      String(value),
    );
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function record(seconds, creation = false) {
  await page.getByRole('button', { name: creation ? '录音' : '练琴录音', exact: true }).click();
  if (await page.locator('.recorder-dialog').count())
    await page
      .getByRole('button', { name: /^(预备并开始录音|开始录音|伴奏继续并开始录音)$/ })
      .click();
  await page.waitForSelector('.recording-bar');
  await wait(seconds * 1000);
  await page.getByRole('button', { name: '停止并保存', exact: true }).click();
  await page.waitForSelector('.recording-bar', { state: 'detached', timeout: 20000 });
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
      '--use-file-for-fake-audio-capture=' + fake,
    ],
    cwd: process.cwd(),
    env: {
      ...process.env,
      IMMERSE_LOCALE: 'zh-CN',
      IMMERSE_DATA_DIR: data,
      IMMERSE_PROFILE_DIR: path.resolve(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  const errors = [];
  await page.evaluate(() => {
    window.__alerts = [];
    const observer = new MutationObserver(() => {
      const text = document.querySelector('.toast')?.textContent;
      if (text && window.__alerts.at(-1) !== text) window.__alerts.push(text);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: '跟练/创作', exact: true }).click();
  await page.getByRole('button', { name: '打开 录音验收', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  const seek = page.getByRole('slider', { name: '播放进度', exact: true });
  await seek.focus();
  await seek.press('Home');
  for (let i = 0; i < 26; i++) await seek.press('ArrowRight');
  assert.equal(Number(await seek.inputValue()), 0.26, 'seek before count-in');
  await page.evaluate(() => {
    window.__clickTimes = [];
    const create = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function (...args) {
      const osc = create.apply(this, args),
        start = osc.start.bind(osc);
      osc.start = function (at) {
        window.__clickTimes.push(at);
        return start(at);
      };
      return osc;
    };
  });
  await page.getByRole('button', { name: '练琴录音', exact: true }).click();
  await page.getByRole('button', { name: '授权 / 刷新录音设备', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector('[aria-label="录音源"]').options.length > 1,
  );
  assert.ok(
    (await page.getByRole('combobox', { name: '伴奏输出设备', exact: true }).innerText()).includes(
      '系统默认输出',
    ),
  );
  await page.getByRole('spinbutton', { name: '录音延迟校正', exact: true }).fill('100');
  await page.getByRole('button', { name: '预备并开始录音', exact: true }).click();
  await page.waitForSelector('.recording-bar');
  await wait(250);
  assert.ok(
    Math.abs(
      Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) - 0.5,
    ) < 0.01,
    'count-in snaps to nearest beat: ' + (await seek.inputValue()),
  );
  await wait(2000);
  await page.screenshot({ path: 'test-output/v014-recording-live.png' });
  await page.getByRole('button', { name: '停止并保存', exact: true }).click();
  await page.waitForSelector('.recording-bar', { state: 'detached', timeout: 20000 });
  let project = store.get(p.id);
  assert.equal(project.takes.length, 1);
  assert.ok(Math.abs(project.takes[0].start - 0.4) < 0.02, JSON.stringify(project.takes[0]));
  assert.ok(project.takes[0].duration > 0.7);
  const clicks = await page.evaluate(() => window.__clickTimes);
  assert.ok(clicks.length >= 4, JSON.stringify(clicks));
  for (let i = 1; i < 4; i++)
    assert.ok(Math.abs(clicks[i] - clicks[i - 1] - 0.5) < 0.006, JSON.stringify(clicks));
  const raw = fs.readFileSync(store.asset(p.id, project.takes[0].rawFile));
  function energy(hz) {
    let re = 0,
      im = 0;
    const rate = raw.readUInt32LE(24),
      count = Math.min(rate, (raw.length - 44) / 8);
    for (let i = 0; i < count; i++) {
      const value = raw.readFloatLE(44 + i * 8);
      re += value * Math.cos((i / rate) * Math.PI * 2 * hz);
      im += value * Math.sin((i / rate) * Math.PI * 2 * hz);
    }
    return Math.hypot(re, im) / count;
  }
  const instrumentEnergy = energy(880),
    backingEnergy = energy(220);
  assert.ok(
    instrumentEnergy > backingEnergy * 30 && instrumentEnergy > 0.01,
    JSON.stringify({ instrumentEnergy, backingEnergy }),
  );
  await page.getByRole('checkbox', { name: '启用预备拍', exact: true }).uncheck();
  await record(0.7);
  await record(0.7);
  project = store.get(p.id);
  assert.equal(project.takes.length, 3);
  assert.equal(project.selectedTakeIds.length, 2);
  assert.equal(await page.locator('.take-timing').count(), 2);
  await page.getByRole('button', { name: /^录音库/ }).click();
  assert.equal(await page.locator('.take-library-row').count(), 3);
  await page
    .locator('.take-library-row')
    .nth(0)
    .getByRole('button', { name: '移回录音库', exact: true })
    .click();
  await page
    .locator('.take-library-row')
    .nth(2)
    .getByRole('button', { name: '加入音轨', exact: true })
    .click();
  assert.equal(store.get(p.id).selectedTakeIds.length, 2);
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files });
  }, imported);
  await page.getByRole('spinbutton', { name: '录音导入位置', exact: true }).fill('4');
  await page.getByRole('button', { name: '导入多条录音', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.take-library-row').length === 5);
  project = store.get(p.id);
  assert.equal(project.takes.length, 5);
  assert.equal(project.selectedTakeIds.length, 2);
  assert.ok(Math.abs(project.takes.at(-1).duration - 3) < 0.01);
  assert.equal(project.takes.at(-1).start, 4);
  await page.screenshot({ path: 'test-output/v014-recording-library.png' });
  await page.getByRole('button', { name: '关闭录音窗口', exact: true }).click();
  await page.screenshot({ path: 'test-output/v014-recording-tracks.png' });
  await page.getByTitle('返回列表', { exact: true }).click();
  await page.getByRole('button', { name: '新建创作', exact: true }).click();
  await page.getByRole('textbox', { name: '名称', exact: true }).fill('录音创作验收');
  await page.getByRole('button', { name: '创建', exact: true }).click();
  await page.getByRole('button', { name: '录音', exact: true }).click();
  await page.waitForSelector('[aria-label="练琴录音设置"]');
  await page.getByRole('button', { name: '开始录音', exact: true }).click();
  await page.waitForSelector('.recording-bar');
  await wait(800);
  await page.getByRole('button', { name: '停止并保存', exact: true }).click();
  await page.waitForSelector('.recording-bar', { state: 'detached', timeout: 20000 });
  await page.getByRole('button', { name: /^录音库/ }).click();
  await page.getByRole('button', { name: '导入多条录音', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.take-library-row').length === 3);
  await page.getByRole('button', { name: '关闭录音窗口', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.track-control').length === 3);
  await page.waitForFunction(
    () =>
      !document.querySelector('.play-main').disabled &&
      Number(document.querySelector('[aria-label="播放进度"]').max) > 3,
  );
  const creation = store.list().find((project) => project.kind === 'creation');
  assert.equal(creation.takes.length, 3);
  assert.ok(creation.duration > 3);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await wait(500);
  assert.ok(
    Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()) > 0.1,
  );
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: 'test-output/v014-creation.png' });
  assert.deepEqual(errors, []);
  console.log(
    'RECORDING_CHECK_PASSED',
    JSON.stringify({
      inputDevices: true,
      outputDevices: true,
      alignedStart: project.takes[0].start,
      metronomeIntervals: clicks.slice(1, 4).map((value, i) => value - clicks[i]),
      instrumentEnergy,
      backingEnergy,
      libraryTakes: project.takes.length,
      practiceSlots: project.selectedTakeIds.length,
      creationTracks: creation.takes.length,
      errors,
    }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    console.error('UI notices:', await page?.evaluate(() => window.__alerts).catch(() => []));
    await page?.screenshot({ path: 'test-output/v014-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
