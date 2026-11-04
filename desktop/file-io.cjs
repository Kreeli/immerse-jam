const fs = require('node:fs');
// A successful write can still consume fewer bytes than requested.
function writeAll(fd, buffer, position = null) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = fs.writeSync(
      fd,
      buffer,
      offset,
      buffer.length - offset,
      position === null ? null : position + offset,
    );
    if (!Number.isInteger(written) || written <= 0 || written > buffer.length - offset) {
      const error = new Error('文件写入未完成，请检查磁盘状态后重试。');
      error.code = 'EIO';
      throw error;
    }
    offset += written;
  }
  return offset;
}
module.exports = { writeAll };
