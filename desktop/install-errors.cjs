// Keep local storage failures out of network retries and preserve their causes.
const messages = {
  space: [
    '磁盘空间不足，请释放数据盘空间或返回修改数据目录。',
    'Not enough disk space. Free space on the data drive or choose another data folder.',
  ],
  permission: [
    '无法写入所选目录，请检查权限或返回选择其他目录。',
    'The selected folder is not writable. Check its permissions or choose another folder.',
  ],
  io: [
    '文件写入未完成，请检查磁盘状态后重试。',
    'The file could not be fully written. Check the drive and try again.',
  ],
  path: [
    '所选路径不可用，请返回检查程序和数据目录。',
    'The selected path is unavailable. Check the program and data folders.',
  ],
};
function localKind(error) {
  const seen = new Set();
  for (let current = error; current && !seen.has(current); current = current.cause) {
    seen.add(current);
    const text = String(current.message || current);
    if (current.code === 'ENOSPC' || /ENOSPC|os error 112|no space left|磁盘空间不足/i.test(text))
      return 'space';
    if (
      ['EACCES', 'EPERM', 'EROFS'].includes(current.code) ||
      /os error (?:5|13)\b|EACCES|EPERM|EROFS/.test(text)
    )
      return 'permission';
    if (current.code === 'EIO') return 'io';
    if (['ENAMETOOLONG', 'ENOTDIR', 'EINVAL'].includes(current.code)) return 'path';
  }
  return null;
}
function localFailure(error) {
  const kind = localKind(error);
  if (!kind) return null;
  if (error.localStorageFailure) return error;
  const failure = new Error(messages[kind][0], { cause: error });
  failure.code =
    kind === 'space'
      ? 'ENOSPC'
      : kind === 'permission'
        ? 'EACCES'
        : kind === 'io'
          ? 'EIO'
          : 'EINVAL';
  failure.localStorageFailure = true;
  failure.englishMessage = messages[kind][1];
  return failure;
}
function errorMessage(error, english = false) {
  const failure = localFailure(error) || error;
  if (english && failure.englishMessage) return failure.englishMessage;
  const value = failure.message || String(failure);
  return english ? require('../shared/locales/en.json')[value] || value : value;
}
module.exports = { localKind, localFailure, errorMessage };
