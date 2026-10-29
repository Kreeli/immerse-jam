const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const QRCode = require('qrcode');
const { pack } = require('./archive.cjs');
const { renderTransferPage } = require('./transfer-page.cjs');
class Transfer {
  constructor(store, onIncoming) {
    this.store = store;
    this.onIncoming = onIncoming;
    this.server = null;
  }
  async start(ids) {
    if (this.server) this.stop();
    if (!Array.isArray(ids) || !ids.length) throw new Error('请先选择要分享的歌曲');
    this.ids = new Set(ids);
    for (const id of ids) this.store.get(id);
    this.token = crypto.randomBytes(24).toString('hex');
    this.expires = Date.now() + 30 * 60 * 1000;
    this.pending = new Map();
    const hostAddresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((x) => x.family === 'IPv4' && !x.internal && !x.address.startsWith('169.254.'))
      .map((x) => x.address);
    this.server = http.createServer((req, res) =>
      this.handle(req, res).catch((e) => {
        if (!res.headersSent) res.writeHead(400);
        res.end(e.message);
      }),
    );
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '0.0.0.0', resolve);
    });
    const port = this.server.address().port;
    const urls = (hostAddresses.length ? hostAddresses : ['127.0.0.1']).map(
      (h) => `http://${h}:${port}/?token=${this.token}`,
    );
    return {
      url: urls[0],
      urls,
      qr: await QRCode.toDataURL(urls[0], { margin: 2, width: 300 }),
      expires: this.expires,
    };
  }
  async handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (url.searchParams.get('token') !== this.token || Date.now() > this.expires) {
      res.writeHead(403);
      return res.end('配对已失效，请重新扫码');
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html;charset=utf-8');
      return res.end(renderTransferPage(url.searchParams.get('lang')));
    }
    if (req.method === 'GET' && url.pathname === '/api/list') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(
        JSON.stringify([...this.ids].map((id) => ({ id, title: this.store.get(id).title }))),
      );
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/download/')) {
      const id = url.pathname.split('/').pop();
      if (!this.ids.has(id)) throw new Error('此歌曲未被选择');
      const dir = path.join(this.store.base, 'transfers');
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, crypto.randomUUID() + '.ijam');
      try {
        await pack(this.store, id, dest);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${id}.ijam"`);
        await pipeline(fs.createReadStream(dest), res);
      } finally {
        fs.rmSync(dest, { force: true });
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/upload') {
      const name = path.basename(url.searchParams.get('name') || 'audio.wav');
      if (!/\.(ijam|aum|mp3|wav|m4a|flac|ogg|aac|mp4|webm)$/i.test(name))
        throw new Error('文件类型不支持');
      const limit = 8 * 1024 ** 3;
      if (Number(req.headers['content-length']) > limit) throw new Error('单个文件不能超过 8 GB');
      const dir = path.join(this.store.base, 'incoming-files');
      fs.mkdirSync(dir, { recursive: true });
      const id = crypto.randomUUID(),
        dest = path.join(dir, id + path.extname(name));
      let received = 0;
      req.on('data', (chunk) => {
        received += chunk.length;
        if (received > limit) req.destroy(new Error('文件过大'));
      });
      await pipeline(req, fs.createWriteStream(dest, { flags: 'wx' }));
      this.pending.set(id, { id, file: dest, name });
      this.onIncoming({ type: 'incoming', id, name, size: received });
      return res.end('OK');
    }
    res.writeHead(404);
    res.end();
  }
  stop() {
    this.server?.closeAllConnections();
    this.server?.close();
    this.server = null;
    this.token = null;
    return true;
  }
}
module.exports = { Transfer };
