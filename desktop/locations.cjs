const fs = require('node:fs'),
  path = require('node:path');
function realTarget(value) {
  let current = value,
    tail = [];
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    tail.unshift(path.basename(current));
    current = parent;
  }
  return path.resolve(fs.existsSync(current) ? fs.realpathSync(current) : current, ...tail);
}
function within(parent, child) {
  const rel = path.relative(parent, child);
  return !rel || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel));
}
function validateRoot(value, installRoot, allowSystemDrive = false) {
  if (
    typeof value !== 'string' ||
    !path.isAbsolute(value) ||
    value.includes('\0') ||
    value.includes('\n')
  )
    throw new Error('请选择完整的数据文件夹路径');
  const root = path.resolve(value),
    actual = realTarget(root),
    appRoot = realTarget(path.resolve(installRoot));
  if (
    path.parse(actual).root === actual ||
    within(appRoot, actual) ||
    within(actual, appRoot) ||
    within(path.resolve(process.env.SystemRoot || 'C:\\Windows'), actual)
  )
    throw new Error('数据目录需要独立于程序和系统目录');
  if (
    !allowSystemDrive &&
    path.parse(actual).root.toLowerCase() ===
      path.parse(path.resolve((process.env.SystemDrive || 'C:') + '\\')).root.toLowerCase()
  )
    throw new Error('使用系统盘前请勾选确认，或选择其他磁盘');
  return root;
}
function configure(app, installRoot) {
  const file = path.join(installRoot, 'installation.json');
  if (!fs.existsSync(file) || process.env.IMMERSE_DATA_DIR) return;
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (config.schemaVersion !== 1 || !path.isAbsolute(config.dataRoot))
    throw new Error('安装位置配置无效');
  const root = path.resolve(config.dataRoot),
    profile = path.join(root, 'profile');
  for (const folder of [profile, path.join(root, 'logs'), path.join(root, 'crashes')])
    fs.mkdirSync(folder, { recursive: true });
  process.env.IMMERSE_DATA_DIR = path.join(root, 'library');
  process.env.IMMERSE_RUNTIME_DIR = path.join(root, 'runtime');
  if (!process.env.IMMERSE_PROFILE_DIR) app.setPath('userData', profile);
  app.setPath('logs', path.join(root, 'logs'));
  app.setPath('crashDumps', path.join(root, 'crashes'));
  app.setPath('sessionData', profile);
}
module.exports = { validateRoot, configure, within };
