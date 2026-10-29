const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm'),
  ts = require('typescript');
const { createInteractionFixture } = require('../scripts/fixtures.cjs'),
  { atempo, exportStems } = require('../desktop/export-audio.cjs'),
  { Transfer } = require('../desktop/transfer.cjs'),
  { catalog, Models } = require('../desktop/models.cjs');
test('invalid tempo cannot hang export, and legacy playback settings recover safely', () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity]) assert.throws(() => atempo(value));
  assert.equal(atempo(1), 'anull');
  assert.equal(atempo(0.125), 'atempo=0.5,atempo=0.5,atempo=0.50000000');
  const { store, p } = createInteractionFixture(1);
  const file = path.join(store.dir(p.id), 'project.json'),
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.practice = { tempo: 0, pitch: -Infinity, master: 9 };
  fs.writeFileSync(file, JSON.stringify(raw));
  const fixed = store.get(p.id);
  assert.equal(fixed.practice.tempo, 0.25);
  assert.equal(fixed.practice.pitch, 0);
  assert.equal(fixed.practice.master, 1);
  fixed.title = '';
  for (const track of fixed.tracks) {
    track.name = null;
    track.label = null;
    track.id = 'same-prefix-' + track.file;
  }
  store.save(fixed);
  const out = exportStems(store, p.id, store.base);
  assert.equal(fs.readdirSync(out).length, fixed.tracks.length + 1);
});
test('built-in model artifacts require complete pinned hashes and reject unpinned installation', async () => {
  for (const model of catalog)
    for (const file of [
      { sha256: model.sha256 },
      ...(model.config ? [{ sha256: model.configSha256 }] : []),
      ...(model.extraFiles || []),
    ])
      assert.match(file.sha256, /^[a-f0-9]{64}$/);
  const { data } = createInteractionFixture(1),
    models = new Models(data);
  models.get = () => ({
    id: 'invalid',
    file: 'bad.ckpt',
    modelUrl: 'https://example.invalid/weights',
    adapter: 'scnet',
  });
  await assert.rejects(models.ensure('invalid'), /SHA-256/);
  assert.ok(!fs.existsSync(path.join(data, 'models/invalid/verified.json')));
});
test('parallel LAN downloads retain independent valid archives and remove temporary files', async (t) => {
  const { store, p } = createInteractionFixture(2),
    transfer = new Transfer(store, () => {});
  t.after(() => transfer.stop());
  await transfer.start([p.id]);
  const url = `http://127.0.0.1:${transfer.server.address().port}/api/download/${p.id}?token=${transfer.token}`;
  const files = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const r = await fetch(url);
      assert.equal(r.status, 200);
      return Buffer.from(await r.arrayBuffer());
    }),
  );
  for (const file of files) {
    const zip = new (require('adm-zip'))(file);
    assert.ok(zip.test());
    assert.equal(JSON.parse(zip.readAsText('project.json')).id, p.id);
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(fs.readdirSync(path.join(store.base, 'transfers')), []);
});
test('Chinese localization never translates the Beat This! product name as an ordinal', () => {
  let language = 'zh-CN';
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/i18n/index.ts', 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require: (name) =>
      name.endsWith('en.json')
        ? require('../shared/locales/en.json')
        : { getPreferences: () => ({ language }) },
  });
  assert.equal(exports.message('Beat This!'), 'Beat This!');
  assert.equal(exports.message('Beat This! is loading'), 'Beat This! is loading');
  assert.equal(exports.message('Beat This! · Beats & BPM'), 'Beat This! · 节拍与 BPM');
  language = 'en';
  assert.equal(exports.message('Beat This! · 节拍与 BPM'), 'Beat This! · Beats & BPM');
});
