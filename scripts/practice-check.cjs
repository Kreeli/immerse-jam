const { _electron: electron } = require('C:/Users/hachimi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const id = '1c04fe09-2c17-42ee-8df7-36381c77f2af';
const source = path.resolve('.runtime/data/projects', id);
const data = path.resolve('.runtime/practice-test');
const target = path.join(data, 'projects', id);
const project = JSON.parse(fs.readFileSync(path.join(source, 'project.json'), 'utf8'));
project.practice = { ...project.practice, tempo: 1, pitch: 0, countIn: false, midi: false, metronome: false };
fs.mkdirSync(target, { recursive: true });
for (const file of new Set([project.original, project.playback, project.scoreMidi, ...project.tracks.map(t => t.file), ...(project.results||[]).flatMap(result=>result.tracks.map(track=>track.file)), ...project.attachments.map(a => a.file)].filter(Boolean))) {
  const destination = path.resolve(target, file);
  assert.ok(destination.startsWith(target + path.sep));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!fs.existsSync(destination)) fs.linkSync(path.resolve(source, file), destination);
}
fs.writeFileSync(path.join(target, 'project.json'), JSON.stringify(project));

let app;
async function range(page, name, value) {
  await page.getByRole('slider', { name, exact: true }).evaluate((element, value) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, String(value));
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function position(page) { return Number(await page.getByRole('slider', { name: '播放进度', exact: true }).inputValue()); }

(async () => {
  app = await electron.launch({ executablePath: process.env.TEST_PACKAGED ? path.resolve('release/win-unpacked/Immerse Jam.exe') : require('electron'), args: process.env.TEST_PACKAGED ? [] : ['.'], cwd: process.cwd(), env: { ...process.env, IMMERSE_DATA_DIR: data, IMMERSE_RUNTIME_DIR: path.resolve('.runtime') } });
  const page = await app.firstWindow();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.locator('.song-info').filter({ hasText: 'Demo' }).click();
  await page.waitForFunction(() => !document.querySelector('.play-main').disabled);
  await range(page, '播放速度', .5);
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(2400);
  const slowPosition = await position(page);
  assert.ok(slowPosition > .8 && slowPosition < 1.6, `Half speed position: ${slowPosition}`);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await range(page, '播放速度', 1);
  await range(page, '播放进度', 3);
  await page.getByRole('button', { name: '设置循环段落开始', exact: true }).click();
  await range(page, '播放进度', 4);
  await page.getByRole('button', { name: '设置循环段落结束', exact: true }).click();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(2000);
  const loopPosition = await position(page);
  assert.ok(loopPosition >= 3 && loopPosition < 4.15, `Loop segment position: ${loopPosition}`);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.getByRole('button', { name: '停止循环', exact: true }).click();
  await range(page, '播放进度', 12);
  await page.screenshot({ path: 'test-output/v013-music-wave.png' });
  await page.getByRole('button', { name: '乐谱', exact: true }).click();
  await page.waitForSelector('.notation svg');
  await page.waitForTimeout(1500);
  await range(page, '播放进度', 12);
  await page.waitForTimeout(300);
  const before = await page.locator('.at-cursor-beat').evaluateAll(elements => elements.map(e => ({ style: e.getAttribute('style'), rect: e.getBoundingClientRect().toJSON() })));
  await range(page, '播放进度', 24);
  await page.waitForTimeout(300);
  const after = await page.locator('.at-cursor-beat').evaluateAll(elements => elements.map(e => ({ style: e.getAttribute('style'), rect: e.getBoundingClientRect().toJSON() })));
  assert.ok(before.length && after.length, 'Score cursor exists');
  assert.ok(before[0].rect.width >= 2, 'Score cursor remains visible after alphaTab scaling');
  assert.notDeepEqual(before, after, 'Score cursor follows aligned transport position');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ halfSpeedPosition: slowPosition, loopPosition, scoreCursorBefore: before, scoreCursorAfter: after, pageErrors: errors }));
  await page.screenshot({ path: 'test-output/practice.png' });
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await app?.close(); });
