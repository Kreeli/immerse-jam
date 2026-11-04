const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
const { createInteractionFixture } = require('../scripts/fixtures.cjs');
const { Takes } = require('../desktop/takes.cjs');
const { Transfer } = require('../desktop/transfer.cjs');
const { createHealth } = require('../desktop/runtime-health.cjs');
const { createNetwork } = require('../desktop/network.cjs');
const {
  rankIndexes,
  installPackages,
  installTorch,
  OFFICIAL,
} = require('../desktop/package-index.cjs');
const { Updates, newer, assetUrl } = require('../desktop/updates.cjs');

test('deleted recordings survive restart, stay out of exports, and can be restored intact', async (t) => {
  const { store, p, data } = createInteractionFixture(1);
  t.after(() => fs.rmSync(data, { recursive: true, force: true }));
  const id = crypto.randomUUID(),
    file = `recordings/${id}/track.wav`;
  fs.mkdirSync(path.dirname(store.asset(p.id, file)), { recursive: true });
  fs.copyFileSync(store.asset(p.id, p.original), store.asset(p.id, file));
  const take = {
    id,
    name: 'A precious recording',
    file,
    start: 0,
    offsetMs: 0,
    duration: 1,
    gain: 1,
    pan: 0,
    mute: false,
    solo: false,
    mode: 'instrument',
    createdAt: new Date().toISOString(),
    recordedTempo: 1,
    recordedPitch: 0,
    latencyMs: 0,
  };
  store.save({ ...p, takes: [take], selectedTakeIds: [id] });
  const original = fs.readFileSync(store.asset(p.id, file));
  const service = new Takes(store, 'unused');
  const deleted = service.remove(p.id, id);
  assert.deepEqual(deleted.selectedTakeIds, []);
  assert.equal(deleted.takes.length, 0);
  const restarted = new Takes(store, 'unused');
  assert.equal(restarted.deleted(p.id)[0].name, take.name);
  const archive = path.join(data, 'deleted.ijam');
  await require('../desktop/archive.cjs').pack(store, p.id, archive, true);
  assert.ok(
    !new (require('adm-zip'))(archive).getEntries().some((entry) => entry.entryName.includes(id)),
  );
  const restored = restarted.restore(p.id, id);
  assert.equal(restored.takes[0].name, take.name);
  assert.deepEqual(restored.selectedTakeIds, [id]);
  assert.deepEqual(fs.readFileSync(store.asset(p.id, file)), original);
  assert.deepEqual(restarted.deleted(p.id), []);
});

test('health checks allow cold imports, share pending work and never cache failures', async () => {
  let calls = 0,
    callback;
  const healthy = createHealth((_exe, _args, options, done) => {
    calls++;
    assert.equal(options.timeout, 120000);
    callback = done;
  });
  const first = healthy(process.execPath),
    second = healthy(process.execPath);
  assert.equal(calls, 1);
  callback(new Error('cold start failed'));
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  const retry = healthy(process.execPath);
  assert.equal(calls, 2);
  callback(null);
  assert.equal(await retry, true);
  assert.equal(await healthy(process.execPath), true);
  assert.equal(calls, 2);
});

test('downloads use the Electron system proxy, and uv receives the resolved proxy', async () => {
  const calls = [];
  const session = {
    fetch: async (...args) => {
      calls.push(args);
      return new Response('proxy bytes');
    },
    resolveProxy: async () => 'PROXY 127.0.0.1:7890; DIRECT',
  };
  const network = createNetwork(
    { app: { whenReady: async () => {} }, session: { defaultSession: session } },
    {},
  );
  assert.equal(await (await network.fetch('https://example.invalid/model')).text(), 'proxy bytes');
  assert.equal(calls.length, 1);
  assert.deepEqual(await network.proxyEnv('https://pypi.org'), {
    HTTPS_PROXY: 'http://127.0.0.1:7890',
    HTTP_PROXY: 'http://127.0.0.1:7890',
  });
});

test('source ranking measures transferred data, and both preferred sources can fall back', async () => {
  const fake = async (url) => {
    if (url.endsWith('/scipy/')) return new Response('<a href="/wheel.whl">wheel</a>');
    const slow = url.includes('official');
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(1));
          setTimeout(
            () => {
              controller.enqueue(new Uint8Array(512 * 1024));
              controller.close();
            },
            slow ? 70 : 5,
          );
        },
      }),
    );
  };
  const indexes = ['https://official.invalid/', 'https://mirror.invalid/'];
  assert.equal((await rankIndexes(indexes, 'scipy', 'wheel.whl', fake))[0], indexes[1]);
  const attempts = [];
  await installPackages(
    'uv',
    [],
    {},
    () => {},
    async (_exe, args, _env, _events, options) => {
      attempts.push(args.at(-1));
      assert.equal(options.stallMs, 120000);
      if (attempts.length === 1) throw new Error('official stalled');
    },
    async () => OFFICIAL,
  );
  assert.equal(attempts.length, 2);
  assert.notEqual(attempts[0], attempts[1]);
  const torch = [];
  await installTorch(
    'uv',
    ['pip', 'install', 'torch==2.8.0'],
    {},
    () => {},
    async (_exe, args) => {
      torch.push(args.at(-1));
      if (torch.length === 1) throw new Error('mirror down');
    },
    'cuda',
    'mirror',
  );
  assert.deepEqual(torch, [
    'https://mirror.sjtu.edu.cn/pytorch-wheels/cu128/',
    'https://download.pytorch.org/whl/cu128/',
  ]);
});

test('an installer child with no output or cache activity is stopped so fallback can run', async () => {
  const began = Date.now();
  await assert.rejects(
    require('../desktop/runtime.cjs').run(
      process.execPath,
      ['-e', 'setInterval(()=>{}, 1000)'],
      {},
      () => {},
      { stallMs: 150, watchDirs: [] },
    ),
    /没有进展/,
  );
  assert.ok(Date.now() - began < 5000);
});

test('LAN invitations are one-use and expire, sessions avoid URL tokens and stop revokes them', async (t) => {
  const { store, p, data } = createInteractionFixture(1);
  const transfer = new Transfer(store, () => {}, { host: '127.0.0.1' });
  t.after(() => {
    transfer.stop();
    fs.rmSync(data, { recursive: true, force: true });
  });
  const pair = await transfer.start([p.id]),
    url = new URL(pair.url),
    token = new URLSearchParams(url.hash.slice(1)).get('token');
  assert.equal(url.search, '');
  assert.equal(transfer.server.address().address, '127.0.0.1');
  assert.ok(pair.expires - Date.now() <= 120000);
  const headers = { Authorization: 'Bearer ' + token };
  const accepted = await fetch(url.origin + '/api/pair', { method: 'POST', headers });
  assert.equal(accepted.status, 200);
  const session = await accepted.json();
  assert.equal((await fetch(url.origin + '/api/pair', { method: 'POST', headers })).status, 403);
  assert.equal((await fetch(url.origin + '/api/list?token=' + session.token)).status, 403);
  assert.equal(
    (
      await fetch(url.origin + '/api/list', {
        headers: { Authorization: 'Bearer ' + session.token },
      })
    ).status,
    200,
  );
  const cookie = accepted.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  assert.equal(
    (await fetch(url.origin + '/api/list', { headers: { Cookie: cookie.split(';')[0] } })).status,
    200,
  );
  transfer.sessions.get(session.token).expires = Date.now() - 1;
  assert.equal(
    (
      await fetch(url.origin + '/api/list', {
        headers: { Authorization: 'Bearer ' + session.token },
      })
    ).status,
    403,
  );
});

test('update check uses only stable app releases and rejects unexpected asset URLs', async () => {
  const release = {
    tag_name: 'v0.1.11',
    assets: [
      {
        name: 'Immerse.Jam.Setup.0.1.11.exe',
        size: 123,
        browser_download_url:
          'https://github.com/Kreeli/immerse-jam/releases/download/v0.1.11/Immerse.Jam.Setup.0.1.11.exe',
      },
      { name: 'SHA256SUMS.txt' },
    ],
  };
  const updates = new Updates('unused', '0.1.10', async () => Response.json(release));
  assert.equal((await updates.check()).available, true);
  assert.equal(newer('v0.1.9', '0.1.10'), false);
  assert.equal(newer('v0.1.10', '0.1.10'), false);
  assert.throws(() =>
    assetUrl('https://github.com/evil/releases/download/v0.1.11/setup.exe', 'v0.1.11'),
  );
  release.prerelease = true;
  await assert.rejects(updates.check(), /检查更新/);
});

test('update download verifies release checksums and rejects an installer changed after download', async (t) => {
  const http = require('node:http');
  const folder = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/update-'));
  const body = Buffer.from('synthetic installer bytes, never executable');
  const sha = crypto.createHash('sha256').update(body).digest('hex');
  const name = 'Immerse.Jam.Setup.0.1.11.exe',
    prefix = 'https://github.com/Kreeli/immerse-jam/releases/download/v0.1.11/';
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Length': body.length });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
    fs.rmSync(folder, { recursive: true, force: true });
  });
  const updater = new Updates(
    folder,
    '0.1.10',
    async (url) =>
      url.endsWith('SHA256SUMS.txt')
        ? new Response(sha + '  ' + name + '\n')
        : Response.json({
            tag_name: 'v0.1.11',
            assets: [
              { name, browser_download_url: prefix + name },
              { name: 'SHA256SUMS.txt', browser_download_url: prefix + 'SHA256SUMS.txt' },
            ],
          }),
    (_url, destination, digest, event) =>
      require('../desktop/runtime.cjs').download(
        `http://127.0.0.1:${server.address().port}/installer`,
        destination,
        digest,
        event,
      ),
  );
  await updater.check();
  await updater.download();
  const file = await updater.verifiedInstaller();
  assert.deepEqual(fs.readFileSync(file), body);
  fs.appendFileSync(file, 'modified');
  await assert.rejects(updater.verifiedInstaller(), /未就绪/);
});

test('GitHub API rate limits fall back to the owned website release catalog', async () => {
  const calls = [];
  const updater = new Updates('unused', '0.1.10', async (url) => {
    calls.push(url);
    if (url.includes('api.github.com')) return new Response('rate limited', { status: 403 });
    return Response.json([
      { tag_name: 'resources-v1', prerelease: true },
      {
        tag_name: 'v0.1.11',
        assets: [{ name: 'Immerse.Jam.Setup.0.1.11.exe' }, { name: 'SHA256SUMS.txt' }],
      },
      { tag_name: 'v0.1.9', assets: [] },
    ]);
  });
  assert.equal((await updater.check()).latest, '0.1.11');
  assert.equal(calls.length, 2);
});
