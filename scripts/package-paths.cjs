const fs = require('node:fs');
const path = require('node:path');
function assertUnlinked(root, target, io = fs) {
  const relative = path.relative(root, target);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
    throw new Error('Package path escapes the project: ' + target);
  let current = root;
  for (const part of ['', ...relative.split(path.sep).filter(Boolean)]) {
    if (part) current = path.join(current, part);
    try {
      if (io.lstatSync(current).isSymbolicLink())
        throw new Error('Refusing to overwrite a linked package path: ' + current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
function packagePaths(root, output = 'release', io = fs) {
  root = path.resolve(root);
  const release = path.resolve(root, output);
  const parts = path.relative(root, release).split(path.sep);
  if (
    !(parts.length === 1 && parts[0] === 'release') &&
    !(parts.length >= 2 && parts[0] === '.runtime' && parts[1] !== '..')
  )
    throw new Error('Package output must be release or a separate folder inside .runtime.');
  const staging = path.join(release, 'build-staging');
  const paths = {
    root,
    release,
    staging,
    prepared: path.join(staging, 'win-unpacked'),
    target: path.join(release, 'win-unpacked'),
    previous: path.join(staging, 'previous-win-unpacked'),
  };
  checkPackagePaths(paths, io);
  return paths;
}
function checkPackagePaths(paths, io = fs) {
  for (const target of [paths.release, paths.staging, paths.prepared, paths.target, paths.previous])
    assertUnlinked(paths.root, target, io);
}
module.exports = { packagePaths, checkPackagePaths };
