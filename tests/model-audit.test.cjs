const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path');
const { Models } = require('../desktop/models.cjs');
test('damaged custom model metadata cannot break the whole model list or change its storage folder', (t) => {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const area = fs.mkdtempSync(path.join(parent, 'model-audit-'));
  t.after(() => {
    assert.equal(path.dirname(area), parent);
    fs.rmSync(area, { recursive: true, force: true });
  });
  const models = new Models(area);
  const valid = {
    schemaVersion: 1,
    custom: true,
    id: 'custom-valid',
    name: 'Valid model '.repeat(20),
    adapter: 'onnx-waveform',
    file: 'model.onnx',
    stems: ['vocals', 'other'],
    sampleRate: 44100,
    sha256: 'a'.repeat(64),
  };
  const invalid = [
    { ...valid, id: undefined },
    { ...valid, id: '../outside' },
    { ...valid, id: 'custom-name', name: { unexpected: true } },
    { ...valid, id: 'custom-stem', stems: [1] },
  ];
  for (const [index, data] of [valid, ...invalid].entries()) {
    const name =
      index === 0
        ? 'custom-valid'
        : ['custom-missing', 'custom-path', 'custom-name', 'custom-stem'][index - 1];
    const folder = path.join(models.base, name);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(data));
  }
  const listed = models.list();
  assert.equal(listed.filter((model) => model.custom).length, 1);
  assert.equal(listed.find((model) => model.custom).id, 'custom-valid');
  assert.ok(listed.every((model) => typeof model.name === 'string'));
  assert.throws(() => models.get('../outside'));
  assert.equal(models.get('custom-valid').installed, false);
  assert.equal(models.get('custom-valid').name, valid.name);
});
