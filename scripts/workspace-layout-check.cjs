const { _electron: electron } = require('playwright'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { createInteractionFixture } = require('./fixtures.cjs'),
  { createSession } = require('../desktop/sessions.cjs'),
  { pack } = require('../desktop/archive.cjs');
const { data, store, p, resultB } = createInteractionFixture(18),
  creation = createSession(store, {
    kind: 'creation',
    sourceId: p.id,
    resultId: resultB,
    title: '创作界面验收',
  }),
  practice = createSession(store, {
    kind: 'practice',
    sourceId: p.id,
    resultId: resultB,
    title: '同步波形验收',
  });
const fake = path.join(data, 'guitar.wav'),
  rate = 48000,
  frames = rate * 35,
  pcm = Buffer.alloc(44 + frames * 4);
pcm.write('RIFF');
pcm.writeUInt32LE(pcm.length - 8, 4);
pcm.write('WAVEfmt ', 8);
pcm.writeUInt32LE(16, 16);
pcm.writeUInt16LE(1, 20);
pcm.writeUInt16LE(2, 22);
pcm.writeUInt32LE(rate, 24);
pcm.writeUInt32LE(rate * 4, 28);
pcm.writeUInt16LE(4, 32);
pcm.writeUInt16LE(16, 34);
pcm.write('data', 36);
pcm.writeUInt32LE(frames * 4, 40);
for (let i = 0; i < frames; i++) {
  const envelope = 0.35 + 0.65 * Math.abs(Math.sin((i / rate) * Math.PI * 2 * 1.1));
  const sample = Math.round(Math.sin((i / rate) * Math.PI * 2 * 880) * 6000 * envelope);
  pcm.writeInt16LE(sample, 44 + i * 4);
  pcm.writeInt16LE(sample, 46 + i * 4);
}
fs.writeFileSync(fake, pcm);
let app, page;
const wait = (ms) => page.waitForTimeout(ms);
const button = (name) => page.getByRole('button', { name, exact: true });
async function ready() {
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
}
async function record() {
  await button('录音').click();
  if (await page.locator('.recorder-dialog').count())
    await page
      .getByRole('button', { name: /^(开始录音|伴奏继续并开始录音|预备并开始录音)$/ })
      .click();
  await page.locator('.recording-bar').waitFor();
}
async function stop() {
  await button('停止并保存').click();
  await page.locator('.recording-bar').waitFor({ state: 'detached' });
  await ready();
}
(async () => {
  const archive = path.join(data, 'source.ijam');
  await pack(store, p.id, archive, false);
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
      IMMERSE_PROFILE_DIR: path.join(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await button('跟练/创作').click();
  await button('打开 ' + creation.title).click();
  await ready();
  assert.equal(await page.locator('.creation-audio-object').count(), 1);
  assert.equal(await page.locator('.mixer .track-control').count(), 0);
  assert.equal(
    await page.locator('.creation-tracks .waveform').count(),
    0,
    'creation has no expanded full-song waveform',
  );
  await page.getByRole('button', { name: '展开分轨项目 ' + p.title, exact: true }).click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-source="group:source"]')?.dataset.peakMax) > 0.1,
  );
  assert.equal(await page.locator('.source-stem-row').count(), 6);
  await page
    .locator('.source-stem-row')
    .first()
    .getByRole('button', { name: '选听', exact: true })
    .click();
  await button('播放').click();
  await wait(300);
  await record();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-source="live-recording"]')?.dataset.peakMax) > 0.01,
  );
  assert.equal(await page.locator('.transport .recording-bar').count(), 1);
  assert.equal(await page.locator('.mixer .practice-record-actions').count(), 0);
  await wait(700);
  await stop();
  let current = store.get(creation.id),
    first = current.takes[0];
  assert.equal(await page.locator('.take-object').count(), 1);
  await page.waitForFunction(
    () => Number(document.querySelector('.take-object .waveform')?.dataset.peakMax) > 0.01,
  );
  await button('展开录音 ' + first.name).click();
  assert.equal(await page.locator('.take-object .waveform').count(), 0);
  const seek = page.getByRole('slider', { name: '播放进度', exact: true });
  await seek.press('Home');
  for (let i = 0; i < Math.round((first.start + 0.15) * 100); i++) await seek.press('ArrowRight');
  await button('播放').click();
  await wait(200);
  const level = async (label) =>
    Number(
      await page
        .getByRole('meter', { name: label + '当前声音大小', exact: true })
        .getAttribute('data-level'),
    );
  assert.ok((await level(first.name)) > 0.02, 'group-internal selection leaves recording audible');
  assert.ok((await level('人声')) > 0.03);
  assert.ok((await level('鼓')) < 1e-6);
  await record();
  assert.equal(
    await page.locator('.recorder-dialog').count(),
    0,
    'configured record starts immediately',
  );
  await wait(600);
  await stop();
  assert.equal(await page.locator('.take-object').count(), 2);
  await button('添加分轨项目').click();
  await button('添加').click();
  await ready();
  assert.equal(await page.locator('.source-object').count(), 2);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, archive);
  await button('添加分轨项目').click();
  await button('从 .ijam / .aum 文件导入').click();
  await ready();
  await page.waitForFunction(() => document.querySelectorAll('.source-object').length === 3);
  current = store.get(creation.id);
  assert.equal(current.sourceGroups.length, 2);
  assert.equal(await page.locator('.creation-audio-object').count(), 5);
  const presets = page.locator('.preset-controls');
  await presets.getByRole('button', { name: '保存', exact: true }).first().click();
  await presets.getByRole('textbox', { name: '预设名称', exact: true }).fill('分组预设');
  await presets.locator('form').getByRole('button', { name: '保存', exact: true }).click();
  const legacy = page.locator('[data-group-id="source"]');
  await legacy.getByRole('button', { name: '关闭声音', exact: true }).first().click();
  await page.getByRole('combobox', { name: '混音预设', exact: true }).selectOption('0');
  await page.waitForFunction(
    async (id) =>
      (await window.jam.call('library')).find((project) => project.id === id)?.sourceMix?.mute ===
      false,
    creation.id,
  );
  assert.equal(store.get(creation.id).sourceMix.mute, false);
  await legacy.getByRole('button', { name: '展开分轨项目 ' + p.title, exact: true }).click();
  if (await page.locator('.take-object').first().getAttribute('data-take-id'))
    await button('展开录音 ' + first.name).click();
  await ready();
  await page.screenshot({ path: 'test-output/v016-creation-tracks.png' });
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'test-drop-file';
    document.body.append(input);
  });
  await page.locator('#test-drop-file').setInputFiles(archive);
  await page.evaluate(() => {
    const input = document.querySelector('#test-drop-file');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(input.files[0]);
    document
      .querySelector('.app')
      .dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer }));
    input.remove();
  });
  await page.waitForFunction(() => document.querySelectorAll('.source-object').length === 4);
  assert.equal(store.get(creation.id).sourceGroups.length, 3);
  assert.equal(store.list().length, 3, 'dropped group does not create a music-library project');
  const before = await page.locator('.practice-area').boundingBox();
  for (let i = 0; i < 25; i++) await button('添加标记点').click();
  assert.equal(await page.locator('.practice-mark-row').count(), 25);
  const after = await page.locator('.practice-area').boundingBox();
  assert.ok(
    Math.abs(before.width - after.width) < 1 && Math.abs(before.height - after.height) < 1,
    'marker count does not shrink main content',
  );
  await page.screenshot({ path: 'test-output/v016-marker-panel.png' });
  await page.getByRole('combobox', { name: '右侧面板', exact: true }).selectOption('mixer');
  const slider = page.getByRole('slider', { name: '节拍器音量', exact: true });
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  assert.ok(box.width >= 90, JSON.stringify(box));
  for (const amount of [0.85, 0.18]) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * amount, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    const value = Number(await slider.inputValue());
    assert.ok(Math.abs(value - amount) < 0.12, String(value));
  }
  assert.ok(store.get(creation.id).practice.metronomeVolume < 0.3);
  await button('跟练/创作').click();
  await button('打开 ' + practice.title).click();
  await ready();
  await button('播放').click();
  await button('练琴录音').click();
  await page
    .getByRole('button', { name: /^(开始录音|伴奏继续并开始录音|预备并开始录音)$/ })
    .click();
  await page.waitForFunction(
    () => Number(document.querySelector('[data-source="live-recording"]')?.dataset.peakMax) > 0.01,
  );
  await wait(1800);
  const waves = await page.locator('.wave-workspace .waveform').evaluateAll((elements) =>
    elements.map((element) => ({
      source: element.dataset.source,
      start: Number(element.dataset.windowStart),
      x: element.getBoundingClientRect().x,
      width: element.getBoundingClientRect().width,
    })),
  );
  assert.equal(waves.length, 2);
  assert.equal(waves[0].source, 'mix');
  assert.equal(waves[1].source, 'live-recording');
  assert.ok(
    Math.abs(waves[0].start - waves[1].start) < 0.001 &&
      Math.abs(waves[0].x - waves[1].x) < 1 &&
      Math.abs(waves[0].width - waves[1].width) < 1,
    JSON.stringify(waves),
  );
  await page.screenshot({ path: 'test-output/v016-practice-dual-wave.png' });
  await stop();
  assert.equal(await page.locator('.practice-recording-waves .waveform').count(), 1);
  await button('设置与模型').click();
  await page.getByRole('combobox', { name: '界面语言', exact: true }).selectOption('en');
  await page.getByRole('combobox', { name: 'Color mode', exact: true }).selectOption('light');
  await page.getByRole('combobox', { name: 'Accent color', exact: true }).selectOption('blue');
  await button('Close window').click();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: 'test-output/v016-practice-en-light.png' });
  await button('Practice / Create').click();
  await button('Open ' + creation.title).click();
  await ready();
  await button('Add stem project').click();
  const dialogText = await page.getByRole('dialog').innerText();
  let interfaceText = dialogText.replaceAll(p.title, '');
  for (const result of p.results) interfaceText = interfaceText.replaceAll(result.name, '');
  assert.ok(!/[\u4e00-\u9fff]/.test(interfaceText), dialogText);
  await button('Cancel').click();
  const controls = await page.locator('.transport-record').boundingBox();
  assert.ok(controls.x >= 0 && controls.x + controls.width <= 1280);
  await page.screenshot({ path: 'test-output/v016-creation-en-light.png' });
  assert.deepEqual(errors, []);
  console.log(
    'WORKSPACE_LAYOUT_PASSED',
    JSON.stringify({
      collapsibleTakes: true,
      groupedStemProjects: 4,
      scopedListening: true,
      quickOverdub: true,
      alignedLiveWaves: true,
      fixedMarkerPanel: true,
      metronomeDrag: true,
      englishLightLayout: true,
      errors,
    }),
  );
})()
  .catch(async (error) => {
    console.error(error);
    await page?.screenshot({ path: 'test-output/v016-failed.png' }).catch(() => {});
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
