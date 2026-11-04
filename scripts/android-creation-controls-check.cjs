// Opt-in acceptance on the authorized physical tablet. Only a newly generated fixture is edited.
const { chromium } = require('playwright');
const fs = require('node:fs'),
  path = require('node:path'),
  cp = require('node:child_process');
const assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const config = JSON.parse(fs.readFileSync('.runtime/android/config.json'));
const adb = path.join(config.sdk, 'platform-tools/adb.exe');
const serial = process.argv[2];
if (!serial) throw Error('Pass the authorized tablet serial');
const cmd = (...args) =>
  cp.execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', windowsHide: true }).trim();
let browser, page, fixtureId, port, fixture, incoming, touch;
const out = 'test-output/android-creation-review';
async function tap(locator, position) {
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(180);
  const bounds = await locator.boundingBox();
  assert.ok(bounds);
  touch ||= await page.context().newCDPSession(page);
  const point = {
    x: bounds.x + (position?.x ?? bounds.width / 2),
    y: bounds.y + (position?.y ?? bounds.height / 2),
  };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await page.waitForTimeout(40);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(80);
}
async function range(input, fraction) {
  await input.scrollIntoViewIfNeeded();
  const bounds = await input.boundingBox();
  await tap(input, { x: 8 + (bounds.width - 16) * fraction, y: bounds.height / 2 });
  return Number(await input.inputValue());
}
async function open(title) {
  if (await page.getByRole('button', { name: '返回列表', exact: true }).isVisible())
    await tap(page.getByRole('button', { name: '返回列表', exact: true }));
  await tap(page.locator('.mobile-project-open').filter({ hasText: title }));
  await page.waitForFunction(
    () => document.querySelector('.play-main') && !document.querySelector('.play-main').disabled,
  );
}
(async () => {
  const pid = cmd('shell', 'pidof', 'app.immersejam.mobile').split(' ')[0];
  port = cmd('forward', 'tcp:0', 'localabstract:webview_devtools_remote_' + pid);
  browser = await chromium.connectOverCDP('http://127.0.0.1:' + port, { noDefaults: true });
  page = browser
    .contexts()[0]
    .pages()
    .find((p) => p.url().includes('/app/'));
  assert.ok(page);
  await page.waitForFunction(() => window.jam);
  assert.equal(await page.locator('.recording-bar').count(), 0, 'never interrupt a recording');
  assert.equal(
    await page.getByRole('button', { name: '暂停', exact: true }).count(),
    0,
    'never interrupt playback',
  );
  fixture = require('./fixtures.cjs').createInteractionFixture(8);
  const title = 'Android 创作控件验收 ' + Date.now();
  let project = require('../desktop/sessions.cjs').createSession(fixture.store, {
    kind: 'creation',
    title,
    sourceId: fixture.p.id,
    resultId: fixture.resultB,
  });
  project = require('../desktop/groups.cjs').addGroup(
    fixture.store,
    project.id,
    fixture.store,
    fixture.p,
    fixture.resultB,
  );
  project.sourceMix = { gain: 1, mute: true, solo: false, start: 0 };
  project.practice.master = 0.03;
  project = fixture.store.save(project);
  const archive = path.join(fixture.data, 'creation.ijam');
  await require('../desktop/archive.cjs').pack(fixture.store, project.id, archive, true);
  const bytes = fs.readFileSync(archive);
  incoming = await page.evaluate((meta) => window.jam.call('peer-begin', meta), {
    name: 'creation.ijam',
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  });
  let offset = 0;
  while (offset < bytes.length)
    offset = await page.evaluate(
      ({ id, offset, chunk }) =>
        window.jam.call('peer-append', { id, offset, chunk: Uint8Array.from(chunk) }),
      { id: incoming, offset, chunk: Array.from(bytes.subarray(offset, offset + 32768)) },
    );
  await page.evaluate((id) => window.jam.call('peer-finish', { id }), incoming);
  const [imported] = await page.evaluate(
    (id) => window.jam.call('peer-select', { id, accept: true }),
    incoming,
  );
  fixtureId = imported.id;
  incoming = null;
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    '.runtime/android/creation-review-fixture.json',
    JSON.stringify({ id: fixtureId, title }),
  );
  await page.reload();
  await open(title);
  await page.evaluate(() => {
    window.__creationWaves = [];
    const call = window.jam.call.bind(window.jam);
    window.jam.call = (method, args) => {
      if (method === 'android-stream-wave') window.__creationWaves.push(structuredClone(args));
      return call(method, args);
    };
  });
  const groupId = imported.sourceGroups[0].id;
  const group = page.locator('.source-object[data-group-id="' + groupId + '"]');
  const gain = group.locator(':scope > .creation-object-heading .nr-strip-ctl input').first();
  const pan = group.locator(':scope > .creation-object-heading .nr-pan');
  assert.equal(await pan.count(), 1);
  await tap(group.locator('.object-expand').first());
  await tap(group.getByRole('button', { name: '显示所有音轨', exact: true }));
  assert.equal(await group.locator('.source-stems-toggle small').count(), 0);
  await page.waitForFunction(
    (id) =>
      Number(document.querySelector('.waveform[data-source="group:' + id + '"]')?.dataset.peakMax) >
      0.1,
    groupId,
    { timeout: 60000 },
  );
  const wave = group.locator('.waveform[data-source="group:' + groupId + '"]');
  const peak = Number(await wave.getAttribute('data-peak-max'));
  await page.evaluate((id) => {
    const node = document.querySelector('.waveform[data-source="group:' + id + '"]');
    window.__emptyCreationWaves = 0;
    window.__creationWaveObserver = new MutationObserver(() => {
      if (!Number(node.dataset.peakCount)) window.__emptyCreationWaves++;
    });
    window.__creationWaveObserver.observe(node, {
      attributes: true,
      attributeFilter: ['data-peak-count'],
    });
  }, groupId);
  for (const value of [0.4, 0.8, 0.55, 0.7]) await range(gain, value);
  const groupGain = Number(await gain.inputValue());
  await page.waitForFunction(
    ({ id, expected }) =>
      Math.abs(
        Number(
          document.querySelector('.waveform[data-source="group:' + id + '"]')?.dataset.peakMax,
        ) - expected,
      ) < 0.004,
    { id: groupId, expected: peak * groupGain },
    { timeout: 60000 },
  );
  const stem = group.locator('.source-stem-row').first();
  const stemGain = await range(stem.locator('.nr-strip-ctl input').first(), 0.3);
  await page.waitForFunction(
    ({ id, expected }) =>
      Math.abs(
        Number(
          document.querySelector('.waveform[data-source="group:' + id + '"]')?.dataset.peakMax,
        ) - expected,
      ) < 0.004,
    { id: groupId, expected: (peak * groupGain * (5 + stemGain)) / 6 },
    { timeout: 60000 },
  );
  assert.equal(
    await page.evaluate(() => window.__emptyCreationWaves),
    0,
    'volume updates never clear the waveform',
  );
  await tap(stem.locator('.track-name'));
  const style = await stem.locator('.nr-strip').evaluate((el) => ({
    background: getComputedStyle(el).backgroundColor,
    shadow: getComputedStyle(el).boxShadow,
  }));
  assert.deepEqual(style, { background: 'rgba(0, 0, 0, 0)', shadow: 'none' });
  const meter = await stem.locator('.nr-live-meter').boundingBox(),
    body = await stem.locator('.nr-strip-body').boundingBox();
  assert.ok(meter.x > body.x + body.width - 1, 'stem meter on the right');
  await tap(stem.locator('.track-name'));
  await tap(page.getByRole('button', { name: '播放', exact: true }));
  const meterSelector =
    '[data-group-id="' + groupId + '"] > .creation-object-heading [role="meter"]';
  await page.waitForFunction(
    (sel) => Number(document.querySelector(sel)?.dataset.level) > 0.1,
    meterSelector,
  );
  const level = Number(await page.locator(meterSelector).getAttribute('data-level'));
  await range(gain, 0.15);
  await page.waitForFunction(
    ({ sel, level }) => {
      const next = Number(document.querySelector(sel)?.dataset.level);
      return next > 0 && next < level * 0.4;
    },
    { sel: meterSelector, level },
  );
  await tap(page.getByRole('button', { name: '暂停', exact: true }));
  const groupPan = await range(pan, 0.7),
    childPan = await range(stem.locator('.nr-pan'), 0.4);
  assert.ok(groupPan > 0.1, 'touch changes the group pan to the right');
  assert.ok(childPan < -0.05, 'touch independently changes the stem pan to the left');
  const trackId = imported.sourceGroups[0].tracks[0].id;
  await page.waitForFunction(
    ({ id, expected }) =>
      window.__creationWaves.some((w) =>
        w.tracks.some((t) => t.id === id && Math.abs(t.pan - expected) < 0.001),
      ),
    { id: trackId, expected: groupPan + childPan },
    { timeout: 60000 },
  );
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await group.locator('.object-expand').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: out + '/device-synthetic-verified.png' });
  const native = await page.evaluate(
    async (id) => (await window.jam.call('library')).find((p) => p.id === id),
    fixtureId,
  );
  assert.equal(native.sourceGroups[0].pan, groupPan);
  assert.equal(native.sourceGroups[0].tracks[0].pan, childPan);
  console.log(
    'ANDROID_CREATION_CONTROLS_PASSED',
    JSON.stringify({
      viewport: await page.evaluate(() => [innerWidth, innerHeight]),
      waveformPeak: peak,
      groupGain,
      stemGain,
      groupPan,
      childPan,
      level,
    }),
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (page && fixtureId) {
        // Guard cleanup by this run's generated ID and title, never a pre-existing project.
        if (await page.getByRole('button', { name: '暂停', exact: true }).isVisible())
          await tap(page.getByRole('button', { name: '暂停', exact: true }));
        const owned = await page
          .evaluate(
            async (id) => (await window.jam.call('library')).find((p) => p.id === id),
            fixtureId,
          )
          .catch(() => null);
        if (owned?.title.startsWith('Android 创作控件验收 '))
          await page.evaluate((id) => window.jam.call('project-delete', { id }), fixtureId);
        await page.reload();
        const before = JSON.parse(fs.readFileSync('.runtime/android/creation-review-before.json'));
        if (before.candidates?.length === 1) await open(before.candidates[0].title);
      }
      if (incoming && page) await page.evaluate(() => window.jam.call('peer-close'));
    } finally {
      await browser?.close();
      if (port) cmd('forward', '--remove', 'tcp:' + port);
    }
  });
