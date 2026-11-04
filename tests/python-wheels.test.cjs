const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { prepare } = require('../desktop/python-wheels.cjs');
test('large ordinary dependency wheels use resumable downloads and skip installed versions', async (t) => {
  fs.mkdirSync(path.resolve('.runtime/test-workspaces'), { recursive: true });
  const area = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/python-wheels-'));
  t.after(() => fs.rmSync(area, { recursive: true, force: true }));
  const constraints = path.join(area, 'constraints.txt');
  fs.writeFileSync(constraints, 'llvmlite==0.50.0\nscipy==1.16.3\n');
  const site = path.join(area, 'venv/Lib/site-packages/scipy-1.16.3.dist-info');
  fs.mkdirSync(site, { recursive: true });
  fs.writeFileSync(path.join(site, 'METADATA'), 'Version: 1.16.3');
  const calls = [],
    events = [],
    folderExpected = path.join(area, 'immerse-python-wheels');
  const folder = await prepare(
    ['--constraint', constraints, '--python', path.join(area, 'venv/Scripts/python.exe')],
    { UV_CACHE_DIR: area },
    (e) => events.push(e),
    ['https://mirror.invalid/', 'https://backup.invalid/'],
    {
      fetchIndex: async (url) => {
        calls.push(url);
        if (url.includes('mirror.invalid')) throw new Error('mirror down');
        return new Response(
          `<a href="https://backup.invalid/llvmlite-0.50.0-cp311-cp311-win_amd64.whl#sha256=${'a'.repeat(64)}">wheel</a>`,
        );
      },
      download: async (url, dest, sha, emit) => {
        assert.equal(sha, 'a'.repeat(64));
        assert.equal(path.dirname(dest), folderExpected);
        emit({ file: path.basename(dest), received: 50, total: 100, progress: 0.5 });
      },
    },
  );
  assert.equal(folder, folderExpected);
  assert.equal(calls.length, 2);
  assert.ok(events.some((e) => e.progress === 0.5));
});
