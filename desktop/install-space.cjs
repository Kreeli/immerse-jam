const fs = require('node:fs');
const path = require('node:path');
const GiB = 1024 ** 3;
function existingParent(folder, io = fs) {
  let current = path.resolve(folder);
  while (!io.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error('所选路径不可用，请返回检查程序和数据目录。');
    current = parent;
  }
  return current;
}
function requiredSpace(dataRoot, mode, models = [], io = fs) {
  const runtime = path.join(dataRoot, 'runtime');
  let state;
  try {
    state = JSON.parse(io.readFileSync(path.join(runtime, 'ready.json'), 'utf8'));
  } catch {}
  const flavor = mode === 'cuda' ? 'cu126' : 'cpu';
  const ready =
    state?.recipe === 3 &&
    state.mode === mode &&
    (!state.flavor || state.flavor === flavor) &&
    io.existsSync(path.join(runtime, 'venv', 'Scripts', 'python.exe'));
  const missing = models.filter(
    (id) => !io.existsSync(path.join(runtime, 'models', id, 'verified.json')),
  ).length;
  // Conservative peak budget: unpacked cache + environment copies + selected models.
  return (ready ? GiB / 4 : mode === 'cuda' ? 16 * GiB : 4 * GiB) + missing * GiB;
}
function checkSpace(dataRoot, mode, models = [], io = fs) {
  const stat = io.statfsSync(existingParent(dataRoot, io));
  const available = Number(stat.bavail) * Number(stat.bsize);
  const required = requiredSpace(dataRoot, mode, models, io);
  if (!Number.isFinite(available)) throw new Error('无法读取所选数据盘的可用空间。');
  if (available < required) {
    const error = new Error(
      '数据盘空间不足：需要预留约 ' +
        (required / GiB).toFixed(1) +
        ' GiB，当前可用 ' +
        (available / GiB).toFixed(1) +
        ' GiB。请释放空间或选择其他目录。',
    );
    error.code = 'ENOSPC';
    error.localStorageFailure = true;
    error.englishMessage =
      'Not enough space on the data drive: reserve about ' +
      (required / GiB).toFixed(1) +
      ' GiB; ' +
      (available / GiB).toFixed(1) +
      ' GiB is available. Free space or choose another folder.';
    throw error;
  }
  return { available, required };
}
module.exports = { checkSpace, requiredSpace, existingParent };
