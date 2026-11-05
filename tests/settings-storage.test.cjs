const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { SettingsStorage } = require('../desktop/settings-storage.cjs');
const DAY = 86400000;
function fixture(t, isBusy = () => false) {
  const workspace = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.mkdtempSync(path.join(workspace, 'settings-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), workspace);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const roots = Object.fromEntries(
    ['library', 'runtime', 'profile', 'logs'].map((n) => [n, path.join(root, n)]),
  );
  for (const p of Object.values(roots)) fs.mkdirSync(p, { recursive: true });
  let now = Date.now();
  const write = (relative, content = 'data', days = 30) => {
    const p = path.join(root, relative);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
    const old = new Date(now - days * DAY);
    fs.utimesSync(p, old, old);
    let parent = path.dirname(p);
    while (parent.startsWith(root + path.sep)) {
      fs.utimesSync(parent, old, old);
      parent = path.dirname(parent);
    }
    return p;
  };
  return {
    root,
    roots,
    write,
    advance: (ms) => (now += ms),
    service: new SettingsStorage({ ...roots, isBusy, now: () => now }),
  };
}
test('cleanup deletes only previewed expired temp content and preserves resumable data and music', async (t) => {
  const f = fixture(t);
  const expired = f.write('runtime/temp/old/decode.bin', 'expired');
  const partial = f.write('runtime/temp/resume/model.part', 'resume');
  const recent = f.write('runtime/temp/recent.wav', 'recent', 0);
  const model = f.write('runtime/models/vocals/model.bin', 'weights');
  const music = f.write('library/projects/track.wav', 'music');
  const wheel = f.write('runtime/cache/wheels/archive.bin', 'cached');
  const preview = await f.service.preview('temp');
  assert.equal(preview.files, 1);
  assert.equal(preview.bytes, 7);
  const result = await f.service.clear(preview.token);
  assert.equal(result.deletedFiles, 1);
  assert.equal(result.freedBytes, 7);
  assert.equal(fs.existsSync(expired), false);
  for (const p of [partial, recent, model, music, wheel]) assert.ok(fs.existsSync(p), p);
  await assert.rejects(() => f.service.clear(preview.token), /预览已过期/);
});
test('old job cleanup accepts only known files in UUID task directories', async (t) => {
  const f = fixture(t),
    old = crypto.randomUUID(),
    unknown = crypto.randomUUID(),
    young = crypto.randomUUID();
  const request = JSON.stringify({ operation: 'analyze' });
  const allowed = f.write('runtime/jobs/' + old + '/request.json', request);
  f.write('runtime/jobs/' + old + '/worker.log', 'log');
  const asset = f.write('runtime/jobs/' + unknown + '/source.wav', 'do not delete');
  f.write('runtime/jobs/' + unknown + '/request.json', request);
  const recent = f.write('runtime/jobs/' + young + '/request.json', request, 1);
  const preview = await f.service.preview('jobs');
  assert.equal(preview.files, 2);
  const result = await f.service.clear(preview.token);
  assert.equal(result.deletedFiles, 2);
  assert.equal(fs.existsSync(allowed), false);
  assert.ok(fs.existsSync(asset));
  assert.ok(fs.existsSync(recent));
});
test('modified candidates and newly added files survive a stale preview', async (t) => {
  const f = fixture(t),
    file = f.write('runtime/temp/item/old.bin', 'old');
  const preview = await f.service.preview('temp');
  fs.writeFileSync(file, 'changed after preview');
  const added = f.write('runtime/temp/item/new.part', 'new', 0);
  const result = await f.service.clear(preview.token);
  assert.equal(result.deletedFiles, 0);
  assert.equal(result.skippedFiles, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), 'changed after preview');
  assert.ok(fs.existsSync(added));
});
test('busy state and expired previews prevent cleanup without consuming valid data', async (t) => {
  let busy = false;
  const f = fixture(t, () => busy);
  const file = f.write('runtime/temp/cache.bin');
  const preview = await f.service.preview('temp');
  busy = true;
  await assert.rejects(() => f.service.clear(preview.token), /任务结束/);
  await assert.rejects(() => f.service.preview('temp'), /任务结束/);
  busy = false;
  f.advance(6 * 60000);
  await assert.rejects(() => f.service.clear(preview.token), /预览已过期/);
  assert.ok(fs.existsSync(file));
  await assert.rejects(() => f.service.preview('../models'), /不支持清理/);
  await assert.rejects(() => f.service.location('../library'), /无效存储/);
});
test('junctions and linked roots are never traversed or removed', async (t) => {
  const f = fixture(t),
    outside = f.write('outside/private.wav', 'private');
  const temp = path.join(f.roots.runtime, 'temp');
  fs.mkdirSync(temp);
  fs.symlinkSync(path.dirname(outside), path.join(temp, 'linked'), 'junction');
  const preview = await f.service.preview('temp');
  assert.equal(preview.files, 0);
  await f.service.clear(preview.token);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'private');
  fs.unlinkSync(path.join(temp, 'linked'));
  fs.rmdirSync(temp);
  fs.symlinkSync(path.dirname(outside), temp, 'junction');
  assert.equal((await f.service.preview('temp')).files, 0);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'private');
});
test('statistics classify retained downloads separately from media and models', async (t) => {
  const f = fixture(t);
  f.write('library/audio.wav', 'music');
  f.write('runtime/models/vocals/weights.bin', 'weights');
  f.write('runtime/cache/installer.part', 'resume');
  const info = await f.service.info(),
    rows = Object.fromEntries(info.locations.map((r) => [r.id, r]));
  assert.equal(rows.library.bytes, 5);
  assert.equal(rows.models.bytes, 7);
  assert.equal(rows.cache.bytes, 6);
  assert.equal(rows.library.path, f.roots.library);
  assert.ok(info.freeBytes === null || info.freeBytes >= 0);
});
test('linked regular files are measured but never offered for cleanup', async (t) => {
  const f = fixture(t),
    original = f.write('library/shared.wav', 'music');
  for (const relative of ['temp/shared.bin', 'venv/shared.bin']) {
    const target = path.join(f.roots.runtime, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.linkSync(original, target);
  }
  const info = await f.service.info();
  const runtime = info.locations.find((row) => row.id === 'runtime');
  assert.equal(runtime.bytes, 5);
  assert.equal(runtime.complete, true);
  assert.equal((await f.service.preview('temp')).files, 0);
  assert.equal(fs.readFileSync(original, 'utf8'), 'music');
});
test('partial cleanup reports failed files and leaves them available for retry', async (t) => {
  const f = fixture(t),
    blocked = f.write('runtime/temp/blocked.bin', 'blocked'),
    removed = f.write('runtime/temp/old.bin', 'old');
  const preview = await f.service.preview('temp'),
    unlink = fs.promises.unlink;
  fs.promises.unlink = async (file) => {
    if (path.resolve(file) === blocked)
      throw Object.assign(new Error('synthetic access denied'), { code: 'EPERM' });
    return unlink(file);
  };
  t.after(() => {
    fs.promises.unlink = unlink;
  });
  const result = await f.service.clear(preview.token);
  assert.equal(result.deletedFiles, 1);
  assert.equal(result.failedFiles, 1);
  assert.equal(result.freedBytes, 3);
  assert.ok(fs.existsSync(blocked));
  assert.equal(fs.existsSync(removed), false);
});
