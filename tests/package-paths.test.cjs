const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { packagePaths } = require('../scripts/package-paths.cjs');
const root = path.resolve('fixture-project');
const missing = {
  lstatSync() {
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  },
};
test('candidate packaging stays inside an independent project output', () => {
  const paths = packagePaths(root, '.runtime/audit-release', missing);
  assert.equal(paths.target, path.join(root, '.runtime/audit-release/win-unpacked'));
  assert.throws(() => packagePaths(root, '../installed', missing), /output/);
  assert.throws(() => packagePaths(root, '.', missing), /output/);
  assert.throws(() => packagePaths(root, 'desktop', missing), /output/);
});
test('packaging refuses a linked application or staging folder before clearing output', () => {
  for (const linked of ['release/win-unpacked', 'release/build-staging', '.runtime']) {
    const io = {
      lstatSync(file) {
        return { isSymbolicLink: () => file === path.resolve(root, linked) };
      },
    };
    assert.throws(
      () => packagePaths(root, linked === '.runtime' ? '.runtime/audit-release' : 'release', io),
      /linked package path/,
    );
  }
});
