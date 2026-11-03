const { test } = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const { Store } = require('../desktop/store.cjs'),
  { Folders } = require('../desktop/folders.cjs'),
  { pack, importArchive } = require('../desktop/archive.cjs');
const cover =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrRkAAAAASUVORK5CYII=';
function fixture() {
  const base = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(base, { recursive: true });
  const root = fs.mkdtempSync(path.join(base, 'details-')),
    store = new Store(root),
    file = path.join(root, 'silent.wav');
  fs.writeFileSync(file, require('../desktop/takes.cjs').wavHeader(0, 48000));
  return { root, store, p: store.create(file, 'Before') };
}
test('project details survive later audio edits and project archive roundtrip', async () => {
  const { root, store, p } = fixture();
  const original = fs.readFileSync(store.asset(p.id, p.original));
  store.update(p.id, { title: 'After', artist: 'Band', description: 'Rehearsal notes', cover });
  store.update(p.id, { practice: { master: 0.4 } });
  const archive = path.join(root, 'project.ijam');
  await pack(store, p.id, archive, true);
  const imported = await importArchive(new Store(path.join(root, 'recipient')), archive);
  assert.equal(imported.title, 'After');
  assert.equal(imported.description, 'Rehearsal notes');
  assert.equal(imported.cover, cover);
  assert.equal(imported.practice.master, 0.4);
  assert.deepEqual(fs.readFileSync(store.asset(p.id, p.original)), original);
  store.update(p.id, { cover: '' });
  assert.equal(store.get(p.id).cover, '');
});
test('invalid or oversized images and descriptions cannot overwrite project details', () => {
  const { store, p } = fixture();
  for (const bad of [
    'https://example.com/picture.jpg',
    'data:image/svg+xml;base64,PHN2Zy8+',
    'data:image/png;base64,YmFk',
    'data:image/png;base64,' + 'A'.repeat(180000),
  ])
    assert.throws(() => store.update(p.id, { cover: bad }));
  assert.throws(() => store.update(p.id, { description: 'a'.repeat(2001) }));
  assert.equal(store.get(p.id).title, 'Before');
});
test('category cover updates preserve membership, survive reload and can reset to default', () => {
  const { store, p } = fixture(),
    folders = new Folders(store);
  const id = folders.edit({ action: 'create', name: 'Band', cover })[0].id;
  folders.edit({ action: 'move', id, projectId: p.id });
  folders.edit({ action: 'rename', id, name: 'Practice' });
  assert.equal(new Folders(store).list()[0].cover, cover);
  assert.deepEqual(folders.list()[0].projectIds, [p.id]);
  folders.edit({ action: 'rename', id, name: 'Practice', cover: '' });
  assert.equal(folders.list()[0].cover, '');
  assert.throws(() =>
    folders.edit({ action: 'rename', id, name: 'Practice', cover: 'file:///outside' }),
  );
  assert.equal(folders.list()[0].name, 'Practice');
});
