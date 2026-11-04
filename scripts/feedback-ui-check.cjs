const { chromium } = require('playwright'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  assert = require('node:assert/strict');
const { store, p, resultB } = require('./fixtures.cjs').createInteractionFixture(8);
const { createSession } = require('../desktop/sessions.cjs');
let creation = createSession(store, {
  kind: 'creation',
  title: '排序创作验收',
  sourceId: p.id,
  resultId: resultB,
});
creation = require('../desktop/groups.cjs').addGroup(store, creation.id, store, p, resultB);
const makeTakes = (project) =>
  ['A', 'B'].map((name) => {
    const id = require('node:crypto').randomUUID(),
      file = 'recordings/' + id + '/normalized.wav',
      target = store.asset(project.id, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(store.asset(project.id, project.original), target);
    return {
      ...project.tracks[0],
      id,
      file,
      name: '录音 ' + name,
      duration: 8,
      start: 0,
      offsetMs: 0,
      mode: 'instrument',
      createdAt: new Date().toISOString(),
    };
  });
creation = store.save({ ...creation, takes: makeTakes(creation) });
let practice = createSession(store, {
  kind: 'practice',
  title: '排序跟练验收',
  sourceId: p.id,
});
practice.takes = makeTakes(practice);
practice.selectedTakeIds = practice.takes.map((t) => t.id);
practice = store.save(practice);
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file;
  try {
    const parts = url.slice(7).split('/');
    file = url.startsWith('/media/')
      ? store.asset(parts.shift(), parts.join('/'))
      : path.resolve('dist', '.' + (url === '/' ? '/index.html' : url));
    if (!url.startsWith('/media/') && !file.startsWith(path.resolve('dist') + path.sep))
      throw Error();
    res.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.wav': 'audio/wav',
        '.wasm': 'application/wasm',
      }[path.extname(file)] || 'application/octet-stream',
    );
    fs.createReadStream(file)
      .on('error', () => {
        res.statusCode = 404;
        res.end();
      })
      .pipe(res);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
let browser;
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    args: ['--mute-audio'],
  });
  const page = await browser.newPage({
      viewport: { width: 1440, height: 940 },
      hasTouch: true,
    }),
    errors = [];
  page.setDefaultTimeout(15000);
  page.on('pageerror', (e) => errors.push(e.message));
  await page.exposeFunction('__qaUpdate', (d) => store.update(d.id, d.patch));
  await page.exposeFunction('__qaRead', (id) => store.get(id || p.id));
  await page.addInitScript(
    (projects) => {
      const fetchOriginal = window.fetch.bind(window);
      window.fetch = (input, init) =>
        fetchOriginal(
          typeof input === 'string' && input.startsWith('immerse://asset/')
            ? '/media/' + input.split('/').slice(3).join('/')
            : input,
          init,
        );
      window.__exportResult = 'E:\\Exports\\practice.ijam';
      window.jam = {
        language: 'zh-CN',
        filePath: () => '',
        onEvent: (fn) => {
          window.__qaEvent = fn;
          return () => {};
        },
        call: async (method, data) => {
          if (method === 'library') return projects;
          if (method === 'folders-list')
            return Array.from({ length: 16 }, (_, index) => ({
              id: 'qa-folder-' + index,
              name:
                index === 0
                  ? 'lamp'
                  : index === 1
                    ? '这是一个非常长的分类文件夹名称用来检查省略号和数量是否挤在一起'
                    : '分类 ' + index,
              projectIds: index === 0 ? [projects[0].id] : [],
            }));
          if (method === 'models') return [];
          if (method === 'runtime-status') return { ready: true };
          if (method === 'download-settings') return { source: 'auto' };
          if (method === 'update') {
            const next = await window.__qaUpdate(data);
            projects = projects.map((p) => (p.id === next.id ? next : p));
            return next;
          }
          if (method === 'playback-budget') return {};
          if (method === 'ui-language' || method === 'cancel') return true;
          if (method === 'export' || method === 'export-audio') return window.__exportResult;
          throw Error('Unexpected feedback UI operation: ' + method);
        },
      };
    },
    [p, creation, practice],
  );
  await page.goto('http://127.0.0.1:' + server.address().port);
  if (process.argv.includes('--sidebar-only')) {
    const sidebar = page.locator('.sidebar'),
      rows = sidebar.locator('.sidebar-folder-row');
    const screenshotDir = 'test-output/sidebar-folders';
    fs.mkdirSync(screenshotDir, { recursive: true });
    for (const width of [200, 236, 360]) {
      await page.evaluate((width) => {
        const saved = JSON.parse(localStorage.getItem('immerse.preferences') || '{}');
        localStorage.setItem(
          'immerse.preferences',
          JSON.stringify({
            ...saved,
            sidebarWidth: width,
            sidebarCollapsed: false,
          }),
        );
      }, width);
      await page.reload();
      await rows.nth(2).waitFor();
      const favorite = sidebar
        .getByRole('button', { name: /^我的收藏/ })
        .locator('.nr-badge-count');
      const badgeStyle = (el) => {
        const s = getComputedStyle(el);
        return [s.font, s.backgroundColor, s.color, s.borderRadius, s.padding];
      };
      const expectedStyle = await favorite.evaluate(badgeStyle),
        favoriteBounds = await favorite.boundingBox();
      for (const row of [rows.nth(0), rows.nth(1), rows.nth(2)]) {
        const count = row.locator('.sidebar-folder-count'),
          menu = row.locator('.sidebar-folder-menu'),
          label = row.locator('.nr-ellipsis');
        assert.deepEqual(await count.evaluate(badgeStyle), expectedStyle);
        const c = await count.boundingBox(),
          m = await menu.boundingBox(),
          l = await label.boundingBox();
        assert.ok(
          Math.abs(c.x + c.width - favoriteBounds.x - favoriteBounds.width) < 1,
          'count badges align on the right',
        );
        assert.ok(
          m.x >= l.x + l.width && m.x - l.x - l.width <= 8,
          'menu follows the name: ' +
            JSON.stringify({
              width,
              c,
              m,
              l,
              button: await row.locator('.nr-nav-item').evaluate((el) => ({
                css: getComputedStyle(el).cssText,
                padding: getComputedStyle(el).padding,
                width: el.getBoundingClientRect().width,
                flex: getComputedStyle(el).flex,
              })),
            }),
        );
        assert.ok(m.x + m.width < c.x, 'menu and count have separate space');
        assert.ok(await menu.isVisible());
      }
      assert.ok(
        await rows
          .nth(2)
          .locator('.nr-ellipsis')
          .evaluate(
            (el) =>
              el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis',
          ),
      );
      await page.screenshot({
        path: screenshotDir + '/sidebar-' + width + '.png',
      });
    }
    const defaultRow = rows.first();
    await defaultRow.locator('.sidebar-folder-menu').click();
    assert.equal(await page.getByRole('menuitem').count(), 1);
    await page.getByRole('menuitem', { name: '编辑分类', exact: true }).click();
    await page.locator('.folder-dialog').getByRole('textbox').fill('未归类的作品');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await defaultRow.getByRole('button', { name: '未归类的作品', exact: true }).click();
    assert.ok((await page.locator('.folder-page h1').textContent()).includes('未归类的作品'));
    await page.reload();
    assert.equal(await defaultRow.locator('.nr-ellipsis').textContent(), '未归类的作品');
    await rows.nth(1).locator('.sidebar-folder-menu').click();
    assert.equal(await page.getByRole('menuitem').count(), 2);
    await page.keyboard.press('Escape');
    const folders = sidebar.locator('.nr-folder-list');
    await folders.hover();
    await page.mouse.wheel(0, 550);
    await page.waitForFunction(() => document.querySelector('.nr-folder-list').scrollTop > 0);
    await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector('.sidebar').getBoundingClientRect().width === 72,
    );
    assert.equal(
      await sidebar.locator('.sidebar-folder-count:visible,.sidebar-folder-menu:visible').count(),
      0,
    );
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    console.log('SIDEBAR_FOLDER_CHECK_PASSED');
    return;
  }
  await page.getByRole('button', { name: '第一次使用？', exact: true }).click();
  assert.equal(await page.locator('.help-first-steps li').count(), 3);
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '管理模型', exact: true }).count(), 0);
  assert.equal(await page.getByText('音乐留在你的设备上', { exact: true }).count(), 0);
  const nav = page.locator('.sidebar');
  const rowMetrics = await nav.locator('.nr-nav-item').evaluateAll((rows) =>
    rows.map((row) => {
      const style = getComputedStyle(row),
        icon = row.querySelector('svg').getBoundingClientRect();
      return {
        height: row.getBoundingClientRect().height,
        font: style.font,
        gap: style.gap,
        x: icon.x,
        icon: icon.width,
      };
    }),
  );
  assert.ok(rowMetrics.length > 6);
  for (const row of rowMetrics)
    assert.deepEqual(
      row,
      rowMetrics[0],
      'navigation and footer rows share size, type, spacing and icon alignment',
    );
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await page.waitForFunction(
    () => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 72) < 1,
  );
  const foot = page.locator('.nr-nav-mini .nr-nav-item');
  const railHelp = await foot.nth(0).boundingBox(),
    railFeedback = await foot.nth(1).boundingBox();
  assert.ok(railFeedback.y >= railHelp.y + railHelp.height + 3);
  await page.getByRole('button', { name: '展开侧栏', exact: true }).click();
  const resize = page.getByRole('separator', { name: '调整侧栏宽度' });
  await resize.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    () => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 248) < 1,
  );
  const handle = await resize.boundingBox();
  await page.mouse.move(handle.x + 3, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + 53, handle.y + 200, { steps: 5 });
  await page.mouse.up();
  assert.equal(
    await resize.evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  await page.waitForFunction(
    () => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 298) < 1,
  );
  await page.reload();
  await page.waitForFunction(
    () => Math.abs(document.querySelector('.sidebar').getBoundingClientRect().width - 298) < 1,
  );
  await page
    .getByRole('button', { name: /交互验收/ })
    .first()
    .click();
  await page.waitForFunction(
    () => document.querySelector('.play-main') && !document.querySelector('.play-main').disabled,
  );
  const wave = page.locator('.main-wave-lane .waveform').first();
  await wave.focus();
  assert.equal(await wave.evaluate((el) => getComputedStyle(el).boxShadow), 'none');
  assert.equal(await wave.evaluate((el) => getComputedStyle(el).outlineStyle), 'none');
  const sortList = page.locator('.mixer .sortable-tracks');
  const ids = () =>
    sortList
      .locator(':scope > .sortable-track')
      .evaluateAll((rows) => rows.map((row) => row.dataset.sortId));
  const beforeOrder = await ids();
  const firstHandle = sortList.locator('.track-name').first();
  const start = await firstHandle.boundingBox();
  const last = await sortList.locator(':scope > .sortable-track').last().boundingBox();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await sortList.locator('[data-dragging="true"]').waitFor();
  await page.mouse.move(start.x + start.width / 2, last.y + last.height - 5, {
    steps: 8,
  });
  await page.mouse.up();
  await page.waitForFunction(
    ({ id, first }) =>
      JSON.parse(localStorage.getItem('immerse.track-order.' + id + ':mixer') || '[]')[0] !==
        undefined &&
      JSON.parse(localStorage.getItem('immerse.track-order.' + id + ':mixer') || '[]')[0] !== first,
    { id: p.id, first: beforeOrder[0] },
  );
  const afterOrder = await ids();
  assert.notDeepEqual(afterOrder, beforeOrder);
  assert.equal(afterOrder.at(-1), beforeOrder[0]);
  assert.equal(await page.getByRole('button', { name: '暂停', exact: true }).count(), 1);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const cancelHandle = await sortList.locator('.track-name').first().boundingBox();
  await page.mouse.move(cancelHandle.x + 8, cancelHandle.y + 10);
  await page.mouse.down();
  await sortList.locator('[data-dragging="true"]').waitFor();
  await page.mouse.move(400, 300, { steps: 5 });
  await page.mouse.up();
  assert.deepEqual(await ids(), afterOrder, 'dropping outside the list cancels');
  const fastHandle = await sortList.locator('.track-name').first().boundingBox();
  await page.mouse.move(fastHandle.x + 8, fastHandle.y + 10);
  await page.mouse.down();
  await page.mouse.move(fastHandle.x + 8, fastHandle.y + 50);
  await page.mouse.up();
  assert.deepEqual(await ids(), afterOrder, 'moving before the long press cannot reorder');
  // Real browser touch events exercise scroll arbitration rather than mouse emulation.
  const touchBefore = await ids(),
    touchStart = await sortList.locator('.track-name').first().boundingBox();
  const touchEnd = await sortList.locator(':scope > .sortable-track').last().boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const tx = touchStart.x + Math.min(40, touchStart.width / 2),
    ty = touchStart.y + touchStart.height / 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: tx, y: ty }],
  });
  await sortList.locator('[data-dragging="true"]').waitFor();
  for (let i = 1; i <= 6; i++)
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: tx, y: ty + ((touchEnd.y + touchEnd.height / 2 - ty) * i) / 6 }],
    });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForFunction(
    () => document.querySelector('.mixer .sortable-tracks')?.dataset.reordering === 'false',
  );
  await page.waitForFunction(
    (first) =>
      Array.from(document.querySelectorAll('.mixer .sortable-tracks > .sortable-track')).at(-1)
        ?.dataset.sortId === first,
    touchBefore[0],
  );
  await cdp.detach();
  assert.equal(await page.locator('.track-drag-handle').count(), 0);
  const volume = page.locator('.track-control input[aria-label$="音量"]').first();
  await volume.hover();
  const slider = await volume.boundingBox();
  await page.mouse.move(slider.x + slider.width / 2, slider.y + slider.height / 2);
  await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(await sortList.getAttribute('data-reordering'), 'false');
  await page.mouse.up();
  const pan = page.locator('.track-control input[aria-label$="左右声像"]').first();
  await pan.focus();
  await page.keyboard.press('End');
  assert.equal(await pan.inputValue(), '1');
  await pan.dblclick();
  assert.equal(await pan.inputValue(), '0');
  assert.equal(await pan.getAttribute('aria-valuetext'), '居中');
  assert.equal(await page.getByRole('button', { name: '确认 BPM', exact: true }).count(), 0);
  assert.equal(await page.getByText('总混音波形', { exact: true }).count(), 0);
  await page.evaluate(() =>
    window.__qaEvent({
      type: 'progress',
      jobId: 'qa-job',
      operation: 'separate',
      progress: 0.15,
      message: '模型已加载，正在分离音轨',
    }),
  );
  const task = page.locator('.task-status');
  await task.waitFor();
  const speed = page.locator('.transport .tempo');
  assert.ok(
    (await task.boundingBox()).x + (await task.boundingBox()).width <=
      (await speed.boundingBox()).x,
  );
  await page.getByRole('button', { name: '音乐库', exact: true }).click();
  assert.ok(await task.isVisible());
  const out = 'test-output/littleclock-feedback';
  fs.mkdirSync(out, { recursive: true });
  await page.screenshot({ path: out + '/library-1440.png' });
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const rects = await Promise.all([task.boundingBox(), speed.boundingBox()]);
    assert.ok(rects[0].x + rects[0].width <= rects[1].x + 1);
  }
  await page.getByRole('button', { name: '返回播放界面 →', exact: false }).click();
  await page.evaluate(() => window.__qaEvent({ type: 'cancelled' }));
  await page.getByRole('button', { name: '导出歌曲项目', exact: true }).click();
  await page.getByRole('button', { name: '完整歌曲项目', exact: false }).click();
  await page.waitForFunction(() => !document.querySelector('.export-options'));
  assert.ok((await page.locator('.toast').textContent()).includes('E:\\Exports\\practice.ijam'));
  await page.getByRole('button', { name: '导出歌曲项目', exact: true }).click();
  await page.evaluate(() => (window.__exportResult = null));
  await page.getByRole('button', { name: '完整歌曲项目', exact: false }).click();
  assert.ok(await page.locator('.export-options').isVisible());
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  await page.screenshot({ path: out + '/player-1440.png' });
  async function moveFirstToLast(list, scope, id) {
    console.log('Checking reorder:', scope);
    await page.locator('.audio-loading').waitFor({ state: 'hidden' });
    const rows = list.locator(':scope > .sortable-track');
    const before = await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId));
    const handle = list
      .locator(':scope > .sortable-track')
      .first()
      .locator('.track-name,.object-expand')
      .first();
    await handle.scrollIntoViewIfNeeded();
    const a = await handle.boundingBox(),
      b = await rows.last().boundingBox();
    const clip = await list.evaluate((el) => {
      let n = el.parentElement;
      while (n && n !== document.body) {
        if (/(auto|scroll)/.test(getComputedStyle(n).overflowY) && n.scrollHeight > n.clientHeight)
          return n.getBoundingClientRect().bottom;
        n = n.parentElement;
      }
      return innerHeight;
    });
    await page.screenshot({
      path: out + '/reorder-' + scope.replace(/[^a-z]/g, '') + '.png',
    });
    await page.mouse.move(a.x + 8, a.y + 10);
    await page.mouse.down();
    await list.locator(':scope > [data-dragging="true"]').waitFor();
    await page.mouse.move(a.x + 8, Math.min(clip - 14, b.y + Math.min(b.height - 5, 40)), {
      steps: 8,
    });
    if (b.y + 40 > clip - 14)
      await page.waitForFunction(
        ({ first, scope }) =>
          Array.from(
            document.querySelectorAll('[data-order-scope="' + scope + '"] > .sortable-track'),
          ).at(-1)?.dataset.sortId === first,
        { first: before[0], scope },
      );
    await page.mouse.up();
    console.log(
      'Drop result',
      scope,
      await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId)),
    );
    await page.waitForFunction(
      ({ id, scope, first }) =>
        JSON.parse(localStorage.getItem('immerse.track-order.' + id + ':' + scope) || '[]').at(
          -1,
        ) === first,
      { id, scope, first: before[0] },
    );
    const after = await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.sortId));
    assert.equal(after.at(-1), before[0]);
    assert.deepEqual([...after].sort(), [...before].sort());
  }
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.getByRole('button', { name: '跟练/创作', exact: true }).click();
  await page.getByRole('button', { name: /^排序创作验收/ }).click();
  await page.waitForFunction(() => document.querySelector('.creation-sort-groups'));
  await moveFirstToLast(page.locator('.creation-sort-groups'), 'groups', creation.id);
  const group = page.locator('.source-object').first();
  await group.locator('.object-expand').first().click();
  await group.getByRole('button', { name: /显示所有音轨/ }).click();
  const groupId = await group.getAttribute('data-group-id');
  assert.equal(await group.locator('.source-stems-toggle small').count(), 0);
  const groupPan = group.locator(':scope > .creation-object-heading .nr-pan');
  await groupPan.focus();
  await page.keyboard.press('End');
  assert.equal(await groupPan.inputValue(), '1');
  await groupPan.dblclick();
  assert.equal(await groupPan.inputValue(), '0');
  const groupWave = group.locator('.waveform[data-source="group:' + groupId + '"]');
  await page.waitForFunction(
    (id) =>
      Number(document.querySelector('.waveform[data-source="group:' + id + '"]')?.dataset.peakMax) >
      0.1,
    groupId,
  );
  const originalPeak = Number(await groupWave.getAttribute('data-peak-max'));
  const groupVolume = group
    .locator(':scope > .creation-object-heading .nr-strip-ctl input')
    .first();
  await groupVolume.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  for (let step = 0; step < 31; step++) await page.keyboard.press('ArrowLeft');
  assert.equal(await groupVolume.inputValue(), '0.69');
  assert.ok(
    Number(await groupWave.getAttribute('data-peak-count')) > 0,
    'volume changes preserve the current waveform',
  );
  await page.waitForFunction(
    ({ id, peak }) =>
      Math.abs(
        Number(
          document.querySelector('.waveform[data-source="group:' + id + '"]')?.dataset.peakMax,
        ) -
          peak * 0.69,
      ) < 0.002,
    { id: groupId, peak: originalPeak },
  );
  const stem = group.locator('.source-stem-row').first();
  await stem.locator('.track-name').click();
  assert.equal(
    await stem.locator('.nr-strip').evaluate((el) => getComputedStyle(el).boxShadow),
    'none',
  );
  assert.equal(
    await stem.locator('.nr-strip').evaluate((el) => getComputedStyle(el).backgroundColor),
    'rgba(0, 0, 0, 0)',
  );
  const meterRect = await stem.locator('.nr-live-meter').boundingBox(),
    stemBody = await stem.locator('.nr-strip-body').boundingBox();
  assert.ok(meterRect.x > stemBody.x + stemBody.width, 'stem meter sits on the right');
  const stemVolume = stem.locator('.nr-strip-ctl input').first();
  await stemVolume.focus();
  await page.keyboard.press('Home');
  await page.waitForFunction(
    ({ id, peak }) =>
      Math.abs(
        Number(
          document.querySelector('.waveform[data-source="group:' + id + '"]')?.dataset.peakMax,
        ) -
          (peak * 0.69 * 5) / 6,
      ) < 0.002,
    { id: groupId, peak: originalPeak },
  );
  const groupMeter = group.locator(':scope > .creation-object-heading [role="meter"]');
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForFunction(
    (id) =>
      Number(
        document.querySelector(
          '[data-group-id="' + id + '"] > .creation-object-heading [role="meter"]',
        )?.dataset.level,
      ) > 0.1,
    groupId,
  );
  const fullLevel = Number(await groupMeter.getAttribute('data-level'));
  await groupVolume.focus();
  await page.keyboard.press('Home');
  for (let step = 0; step < 10; step++) await page.keyboard.press('ArrowRight');
  await page.waitForFunction(
    ({ id, full }) => {
      const level = Number(
        document.querySelector(
          '[data-group-id="' + id + '"] > .creation-object-heading [role="meter"]',
        )?.dataset.level,
      );
      return level > 0 && level < full * 0.2;
    },
    { id: groupId, full: fullLevel },
  );
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.screenshot({ path: out + '/creation-group-controls.png' });
  await stem.locator('.track-name').click();
  await moveFirstToLast(group.locator('.source-stems-list'), 'group:' + groupId, creation.id);
  await group.locator('.object-expand').first().click();
  while (await page.locator('.creation-sort-takes .object-expand[aria-expanded="true"]').count())
    await page.locator('.creation-sort-takes .object-expand[aria-expanded="true"]').first().click();
  await moveFirstToLast(page.locator('.creation-sort-takes'), 'takes', creation.id);
  const lastGroup = await page.locator('.source-object').last().boundingBox(),
    firstTake = await page.locator('.take-object').first().boundingBox();
  assert.ok(
    firstTake.y >= lastGroup.y + lastGroup.height + 11,
    'group and recording cards have a real gap',
  );
  const groupGain = await page.locator('.source-object .nr-strip-ctl input').first().boundingBox();
  const takeGain = await page.locator('.take-object .nr-strip-ctl input').first().boundingBox();
  assert.ok(Math.abs(groupGain.x - takeGain.x) < 2, 'shared top-level controls align');
  const creationTake = page.locator('.creation-sort-takes .take-object').first();
  assert.equal(await creationTake.locator('.take-timing').count(), 0);
  const timingButton = creationTake.getByRole('button', { name: /^时间微调/ });
  await timingButton.click();
  const timingPanel = creationTake.locator('.take-timing');
  await timingPanel.waitFor();
  assert.ok(
    (await timingPanel.boundingBox()).y >=
      (await creationTake.locator('.creation-object-heading').boundingBox()).y +
        (await creationTake.locator('.creation-object-heading').boundingBox()).height,
  );
  assert.deepEqual(
    await creationTake
      .locator('.track-name-actions button')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')?.split(' ')[0])),
    ['重命名音轨', '时间微调', '移回录音库'],
  );
  await page.screenshot({ path: out + '/creation-timing.png' });
  await timingButton.click();
  assert.equal(await timingPanel.count(), 0);
  await page.screenshot({ path: out + '/creation-order.png' });
  await page.getByRole('button', { name: '跟练/创作', exact: true }).click();
  await page.getByRole('button', { name: /^排序跟练验收/ }).click();
  await page.waitForFunction(() => document.querySelector('.mixer .sortable-tracks'));
  await moveFirstToLast(page.locator('.mixer .sortable-tracks'), 'mixer', practice.id);
  const practiceTake = page
    .locator('.mixer-track-entry')
    .filter({ has: page.getByRole('button', { name: /^时间微调/ }) })
    .first();
  assert.equal(await practiceTake.locator('.take-timing').count(), 0);
  const pt = practiceTake.getByRole('button', { name: /^时间微调/ });
  await pt.click();
  const pp = practiceTake.locator('.take-timing'),
    tc = practiceTake.locator('.track-control');
  await pp.waitFor();
  await page.screenshot({ path: out + '/practice-timing.png' });
  assert.ok(
    (await pp.boundingBox()).y >= (await tc.boundingBox()).y + (await tc.boundingBox()).height,
  );
  await pp.getByRole('button', { name: '后移 10 ms', exact: true }).click();
  await pt.click();
  assert.equal(await page.locator('.track-drag-handle').count(), 0);
  assert.deepEqual(errors, []);
  console.log('FEEDBACK_UI_CHECK_PASSED');
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
  });
