const { _electron: electron } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { Store } = require('../desktop/store.cjs');
const data = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/analysis-')),
  store = new Store(data);
let p = store.create(path.resolve('.runtime/rhythm-check/drums-120.wav'), '节拍验收');
p.duration = 32;
p = store.save(p);
let app, page;
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
      IMMERSE_PROFILE_DIR: path.resolve(data, 'ui-profile'),
      IMMERSE_RUNTIME_DIR: path.resolve('.runtime'),
    },
  });
  page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() => {
    window.__analysisEvents = [];
    window.jam.onEvent((event) => {
      if (event.operation === 'analyze') window.__analysisEvents.push(event);
    });
  });
  await page.locator('.song-info').filter({ hasText: '节拍验收' }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await page.getByRole('button', { name: '开始分析', exact: true }).click();
  assert.ok(
    !(await page.locator('.field select').innerText()).includes('Beat This!'),
    'beat model must not be offered for stem separation',
  );
  await page.getByRole('button', { name: /识别和弦与节拍/ }).click();
  await page.waitForFunction(
    () => window.__analysisEvents.some((event) => ['complete', 'error'].includes(event.type)),
    {},
    { timeout: 90000 },
  );
  const events = await page.evaluate(() => window.__analysisEvents),
    complete = events.find((event) => event.type === 'complete');
  assert.ok(complete, JSON.stringify(events));
  const analysis = store.get(p.id).analysis;
  assert.equal(analysis.tempoMethod, 'beat-this');
  assert.ok(Math.abs(analysis.bpm - 120) < 1);
  assert.ok(analysis.downbeats.length > 5);
  assert.ok(analysis.chords.length > 0);
  assert.equal(analysis.tempoReviewed, false);
  assert.deepEqual(errors, []);
  console.log(
    'ANALYSIS_CHECK_PASSED',
    JSON.stringify({
      bpm: analysis.bpm,
      method: analysis.tempoMethod,
      beats: analysis.beats.length,
      downbeats: analysis.downbeats.length,
      chords: analysis.chords.length,
      errors,
    }),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app?.close();
  });
