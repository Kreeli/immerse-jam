const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pack } = require('./archive.cjs');
class PeerFiles {
  constructor(store, onIncoming) {
    this.store = store;
    this.onIncoming = onIncoming;
    this.outgoing = new Map();
    this.incoming = new Map();
    this.pending = new Map();
    this.generation = 0;
  }
  async prepare(ids) {
    const generation = this.generation;
    if (!Array.isArray(ids) || ids.length > 100) throw new Error('一次最多传输 100 首歌曲');
    const result = [];
    for (const id of ids) {
      const p = this.store.get(id),
        key = crypto.randomUUID();
      const file = path.join(this.store.base, 'transfers', key + '.ijam');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        await pack(this.store, id, file, true);
        if (generation !== this.generation) throw new Error('连接已关闭');
      } catch (error) {
        fs.rmSync(file, { force: true });
        throw error;
      }
      const hash = crypto.createHash('sha256');
      for await (const b of fs.createReadStream(file)) hash.update(b);
      const item = {
        id: key,
        name: p.title + '.ijam',
        size: fs.statSync(file).size,
        sha256: hash.digest('hex'),
      };
      this.outgoing.set(key, { ...item, file, fd: fs.openSync(file, 'r') });
      result.push(item);
    }
    return result;
  }
  read({ id, offset, binary = false }) {
    const item = this.outgoing.get(id);
    if (!item || !Number.isSafeInteger(offset) || offset < 0 || offset > item.size)
      throw new Error('无效传输片段');
    const buffer = Buffer.alloc(Math.min(48 * 1024, item.size - offset)),
      fd = item.fd;
    fs.readSync(fd, buffer, 0, buffer.length, offset);
    return binary ? new Uint8Array(buffer) : buffer.toString('base64');
  }
  begin(item) {
    if (this.incoming.size) throw new Error('已有文件正在接收');
    if (
      !Number.isSafeInteger(item.size) ||
      item.size < 1 ||
      item.size > 8 * 1024 ** 3 ||
      !/^[a-f0-9]{64}$/.test(item.sha256)
    )
      throw new Error('文件清单无效');
    const id = crypto.randomUUID(),
      dir = path.join(this.store.base, 'incoming-files');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, id + '.ijam');
    this.incoming.set(id, {
      id,
      file,
      name: String(item.name).slice(0, 200),
      size: item.size,
      sha256: item.sha256,
      received: 0,
      hash: crypto.createHash('sha256'),
      fd: fs.openSync(file, 'wx'),
    });
    return id;
  }
  append({ id, offset, chunk }) {
    const item = this.incoming.get(id);
    if (
      !item ||
      offset !== item.received ||
      (typeof chunk !== 'string' && !(chunk instanceof Uint8Array)) ||
      chunk.length > 65536
    )
      throw new Error('传输片段顺序无效');
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'base64') : Buffer.from(chunk);
    if (!buffer.length || item.received + buffer.length > item.size)
      throw new Error('文件长度无效');
    fs.writeSync(item.fd, buffer);
    item.hash.update(buffer);
    item.received += buffer.length;
    return item.received;
  }
  finish({ id }) {
    const item = this.incoming.get(id);
    if (!item) throw new Error('传输已失效');
    fs.closeSync(item.fd);
    this.incoming.delete(id);
    if (item.received !== item.size || item.hash.digest('hex') !== item.sha256) {
      fs.unlinkSync(item.file);
      throw new Error('接收校验失败，请重新发送');
    }
    this.pending.set(id, item);
    this.onIncoming({ type: 'incoming', id, name: item.name, size: item.size, remote: true });
    return true;
  }
  close() {
    this.generation++;
    for (const item of this.incoming.values()) {
      fs.closeSync(item.fd);
      fs.unlinkSync(item.file);
    }
    this.incoming.clear();
    for (const item of this.outgoing.values()) {
      fs.closeSync(item.fd);
      fs.rmSync(item.file, { force: true });
    }
    this.outgoing.clear();
    for (const item of this.pending.values()) fs.rmSync(item.file, { force: true });
    this.pending.clear();
  }
}
module.exports = { PeerFiles };
