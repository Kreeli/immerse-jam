// Real React-hook regression checks, using synthetic data and a controlled bridge.
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright');
let server, browser;
(async () => {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const area = fs.mkdtempSync(path.join(parent, 'state-review-'));
  const relative = path.relative(process.cwd(), area).replaceAll('\\', '/');
  fs.writeFileSync(
    path.join(area, 'index.html'),
    '<div id="root"></div><script type="module" src="/' + relative + '/harness.tsx"></script>',
  );
  fs.writeFileSync(
    path.join(area, 'harness.tsx'),
    `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {useWorkspace} from '/src/app/useWorkspace'; import {Player} from '/src/audio/Player';
import {jamCall} from '/src/platform/project-call'; import {merge} from '/shared/project-patch.cjs';
window.__remote={schemaVersion:1,id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',title:'fixture',artist:'',original:'media/test.wav',duration:1,tracks:[],results:[],attachments:[],bookmarks:[],practice:{tempo:1,pitch:0,master:.8,eq:[0,0,0]},notes:'original'};
window.__fail=false;window.__calls=[];const listeners=new Set();window.__emit=e=>listeners.forEach(fn=>fn(e));window.__call=jamCall;
window.jam={language:'zh-CN',filePath:()=>'',onEvent:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},call:async(method,data)=>{
window.__calls.push({method,data});
if(method==='library')return [structuredClone(window.__remote)];
if(method==='models'||method==='folders-list')return [];
if(method==='runtime-status')return {ready:true};
if(method==='update'){await new Promise(r=>setTimeout(r,60));if(window.__fail)throw Error('simulated disk failure');window.__remote=merge(window.__remote,data.patch);return structuredClone(window.__remote);}
if(method==='download-settings')return {source:'auto'};
return true;}};
Player.prototype.load=async function(p){this.project=p;this.duration=1;};
Player.prototype.waveform=async()=>[];Player.prototype.previewWaveform=()=>[];
function Harness(){const w=useWorkspace();window.__workspace=w;return React.createElement('div',null,w.project?.notes||'ready');}
createRoot(document.getElementById('root')).render(React.createElement(Harness));
`,
  );
  const built = path.join(area, 'built');
  await (
    await import('vite')
  ).build({
    configFile: false,
    base: '/',
    build: {
      outDir: built,
      emptyOutDir: false,
      rollupOptions: { input: path.join(area, 'index.html') },
    },
    logLevel: 'error',
  });
  server = require('node:http').createServer((req, res) => {
    const file = path.resolve(
      built,
      '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
    );
    if (!file.startsWith(built + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'application/javascript'
          : 'application/octet-stream',
    );
    fs.createReadStream(file)
      .on('error', () => {
        res.statusCode = 404;
        res.end();
      })
      .pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({
    args: ['--mute-audio'],
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto('http://127.0.0.1:' + server.address().port + '/' + relative + '/index.html');
  await page.waitForFunction(() => window.__workspace?.library.length === 1);
  await page.evaluate(() => window.__workspace.openProject(window.__remote));
  await page.waitForFunction(() => window.__workspace.project?.notes === 'original');
  await page.evaluate(() =>
    window.__workspace.saveNotes({ ...window.__workspace.project, notes: 'new notes' }),
  );
  await page.waitForFunction(() => window.__workspace.project.notes === 'new notes');
  await page.evaluate(() => {
    const w = window.__workspace;
    w.save({ ...w.project, practice: { ...w.project.practice, master: 0.4 } });
  });
  await page.waitForFunction(
    () => window.__remote.notes === 'new notes' && window.__remote.practice.master === 0.4,
  );
  assert.equal(await page.evaluate(() => window.__workspace.project.notes), 'new notes');
  await page.evaluate(() => {
    window.__fail = true;
    const w = window.__workspace;
    w.saveNotes({ ...w.project, notes: 'retained on failure' });
  });
  await page.waitForFunction(() => window.__workspace.saveState === 'error');
  assert.equal(await page.evaluate(() => window.__remote.notes), 'new notes');
  assert.equal(await page.evaluate(() => window.__workspace.project.notes), 'retained on failure');
  const before = await page.evaluate(
    () => window.__calls.filter((c) => c.method === 'update').length,
  );
  await page.mouse.click(10, 10);
  await page.keyboard.press('Shift');
  await page.waitForTimeout(120);
  assert.equal(
    await page.evaluate(() => window.__calls.filter((c) => c.method === 'update').length),
    before,
    'failed save is not repeated on every click',
  );
  await page.evaluate(() =>
    window.__call('result-select', {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      resultId: 'other',
    }),
  );
  await page.evaluate(() => window.__emit({ type: 'closing' }));
  await page.waitForFunction(() =>
    window.__calls.some((c) => c.method === 'window' && c.data.action === 'close-cancel'),
  );
  assert.equal(
    await page.evaluate(() =>
      window.__calls.some((c) => c.method === 'window' && c.data.action === 'close-ready'),
    ),
    false,
  );
  await page.evaluate(async () => {
    window.__fail = false;
    await window.__workspace.flushEdits();
  });
  assert.equal(await page.evaluate(() => window.__remote.notes), 'retained on failure');
  await page.evaluate(() => window.__emit({ type: 'closing' }));
  await page.waitForFunction(() =>
    window.__calls.some((c) => c.method === 'window' && c.data.action === 'close-ready'),
  );
  await page.evaluate(() => {
    window.__fail = true;
    const w = window.__workspace;
    w.save({ ...w.project, practice: { ...w.project.practice, master: 0.1 } });
  });
  await page.waitForFunction(() => window.__workspace.saveState === 'error');
  await page.evaluate(() => window.__workspace.discardChanges());
  assert.equal(await page.evaluate(() => window.__workspace.project.practice.master), 0.4);
  await page.evaluate(() =>
    window.__call('result-select', { id: window.__remote.id, resultId: 'same-project' }),
  );
  assert.deepEqual(errors, []);
  console.log(
    'React save regressions passed: notes/edit interleaving, retained failed notes, no click retry flood, scoped ordering, close cancellation and retry.',
  );
})()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server?.close();
  });
