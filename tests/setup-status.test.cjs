const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { create } = require('../desktop/setup-status.cjs');
const area = () => fs.mkdtempSync(path.join(path.resolve('.runtime/test-workspaces'), 'status-'));
const read = (file) =>
  Object.fromEntries(
    fs
      .readFileSync(file, 'utf16le')
      .replace(/^\ufeff\[Progress\]\r\n/, '')
      .trimEnd()
      .split('\r\n')
      .map((s) => {
        const i = s.indexOf('=');
        return [s.slice(0, i), s.slice(i + 1)];
      }),
  );
test('native setup reports UTF-16 real bytes, retains stage, and clears stale percentages during verification', async () => {
  const file = path.join(area(), 'progress.ini'),
    status = create(file);
  status.send({
    stage: { index: 3, total: 6, name: 'model', modelName: '六轨' },
    file: '模型.ckpt',
    received: 0,
    total: 100,
    progress: 0,
  });
  assert.equal(read(file).percent, '0');
  assert.equal(read(file).overall, '50');
  status.send({
    file: '模型.ckpt',
    received: 50 * 1048576,
    total: 100 * 1048576,
    progress: 0.5,
    bytesPerSecond: 2 * 1048576,
  });
  await new Promise((r) => setTimeout(r, 150));
  assert.match(read(file).stage, /下载模型 · 六轨/);
  assert.equal(read(file).percent, '50');
  assert.match(read(file).transfer, /50.0 MiB \/ 100.0 MiB.*2.0 MiB\/s/);
  status.send({ file: '模型.ckpt', phase: 'verify', message: '正在校验\r\nstate=complete' });
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(read(file).percent, '');
  assert.equal(read(file).transfer, '');
  assert.equal(read(file).state, 'running');
  status.finish(new Error('连接断开，已下载内容保留'));
  assert.equal(read(file).state, 'failed');
  assert.match(read(file).message, /已下载内容保留/);
});
test('native setup completes only on explicit commit and flushes pending UI events', async () => {
  const file = path.join(area(), 'progress.ini'),
    status = create(file, true);
  status.send({ stage: { index: 4, total: 4, name: 'complete' }, progress: 1 });
  assert.equal(read(file).state, 'running');
  status.send({ file: 'stale.ckpt', progress: 0.1 });
  status.finish();
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(read(file).state, 'complete');
  assert.equal(read(file).percent, '100');
  assert.equal(read(file).overall, '100');
  assert.equal(read(file).file, 'Selected components are ready');
});
