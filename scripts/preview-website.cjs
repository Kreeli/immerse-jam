const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../docs/site');
const port = Number(process.env.IMMERSE_SITE_PORT || 4178);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  // Mirror GitHub Pages' project subpath during local preview.
  pathname = pathname.replace(/^\/immerse-jam(?=\/|$)/, '');
  const filename = path.resolve(
    root,
    '.' + (pathname === '' || pathname === '/' ? '/index.html' : pathname),
  );
  if (!filename.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405).end();
    return;
  }
  fs.stat(filename, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(filename).pipe(res);
  });
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Immerse Jam website: http://127.0.0.1:${port}/immerse-jam/`),
);
