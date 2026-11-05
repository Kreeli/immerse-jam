const test = require('node:test'),
  assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path');
const register = require('../desktop/settings-ipc.cjs');
function setup(t) {
  const workspace = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(workspace, { recursive: true });
  const root = fs.mkdtempSync(path.join(workspace, 'settings-ipc-'));
  t.after(() => {
    assert.equal(path.dirname(root), workspace);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const roots = Object.fromEntries(
    ['library', 'runtime', 'profile', 'logs'].map((id) => [id, path.join(root, id)]),
  );
  Object.values(roots).forEach((p) => fs.mkdirSync(p, { recursive: true }));
  let scale = 1,
    copied = '',
    opened = [];
  const handlers = new Map();
  register({
    handle: (id, fn) => handlers.set(id, fn),
    app: { getVersion: () => '0.1.12' },
    shell: {
      openPath: async (p) => {
        opened.push(p);
        return '';
      },
    },
    clipboard: {
      writeText: (value) => {
        copied = value;
      },
    },
    getWindow: () => ({
      webContents: {
        getZoomFactor: () => scale,
        setZoomFactor: (value) => {
          scale = value;
        },
      },
    }),
    roots,
    isBusy: () => false,
    getState: () => ({
      ready: true,
      runtimeMode: 'cpu',
      installing: false,
      processing: false,
      modelDownloads: 0,
    }),
  });
  return { handlers, roots, root, scale: () => scale, copied: () => copied, opened };
}
test('diagnostic copying contains only local status and known paths, with allowlisted folder opening', async (t) => {
  const f = setup(t);
  assert.equal(f.handlers.get('settings-copy-diagnostics')(), true);
  const summary = JSON.parse(f.copied());
  assert.equal(summary.version, '0.1.12');
  assert.equal(summary.ready, true);
  assert.equal(summary.locations.library, f.roots.library);
  assert.equal(summary.locations.installLog, path.join(f.root, 'installation.log'));
  assert.equal(Object.hasOwn(summary, 'projects'), false);
  await assert.rejects(
    () => f.handlers.get('settings-open-location')({ id: '../../outside' }),
    /无效存储/,
  );
  await f.handlers.get('settings-open-location')({ id: 'library' });
  assert.deepEqual(f.opened, [f.roots.library]);
});
test('native scale accepts only bounded finite numbers', (t) => {
  const f = setup(t),
    change = f.handlers.get('ui-scale');
  assert.equal(change({ scale: 1.25 }).scale, 1.25);
  for (const scale of [0, 2, NaN, Infinity, '1.25'])
    assert.throws(() => change({ scale }), /界面缩放/);
  assert.equal(f.scale(), 1.25);
});
