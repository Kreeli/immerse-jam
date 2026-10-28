const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { downloadModel } = require('../desktop/runtime.cjs');

test(
  'a failed model range leaves the other ranges resumable without closing their file early',
  { timeout: 30000 },
  async (t) => {
    const root = path.resolve('.runtime/test-workspaces');
    fs.mkdirSync(root, { recursive: true });
    const directory = fs.mkdtempSync(path.join(root, 'download-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const destination = path.join(directory, 'model.bin');
    const total = 64 * 1024 * 1024;
    const existing = total - 16;
    fs.closeSync(fs.openSync(destination + '.part', 'w'));
    fs.truncateSync(destination + '.part', existing);
    let fail = true;
    let delayed = false;
    const server = http.createServer((request, response) => {
      const [, startText, endText] = /bytes=(\d+)-(\d+)/.exec(request.headers.range);
      const start = Number(startText),
        end = Number(endText);
      if (start === existing && fail) {
        response.writeHead(503);
        response.end();
        return;
      }
      const send = () => {
        response.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Content-Length': end - start + 1,
        });
        response.end(Buffer.alloc(end - start + 1, start ? 97 : 0));
      };
      if (start === existing + 2 && !delayed) {
        delayed = true;
        setTimeout(send, 11000);
      } else send();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      server.close();
    });
    const url = `http://127.0.0.1:${server.address().port}/model`;
    await assert.rejects(downloadModel(url, destination));
    const saved = JSON.parse(fs.readFileSync(destination + '.ranges.json', 'utf8'));
    assert.equal(
      saved.ranges[1].received,
      2,
      'the delayed range finished before its shared file closed',
    );
    assert.equal(fs.existsSync(destination), false);
    fail = false;
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.alloc(existing));
    hash.update(Buffer.alloc(16, 97));
    await downloadModel(url, destination, hash.digest('hex'));
    assert.equal(fs.statSync(destination).size, total);
    assert.equal(fs.existsSync(destination + '.ranges.json'), false);
  },
);
