const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { localFailure, errorMessage } = require('../desktop/install-errors.cjs');
const { checkSpace, requiredSpace } = require('../desktop/install-space.cjs');
const { installTorch, installPackages } = require('../desktop/package-index.cjs');
const { createGpuProbe } = require('../desktop/gpu-health.cjs');
const { validateRoot } = require('../desktop/locations.cjs');
function area(t) {
  const parent = path.resolve('.runtime/test-workspaces');
  fs.mkdirSync(parent, { recursive: true });
  const folder = fs.mkdtempSync(path.join(parent, 'installer-audit-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  return folder;
}
test('disk and permission failures retain their cause and are not retried on another package index', async () => {
  for (const input of [
    new Error('failed to copy torch.dll: disk full (os error 112)'),
    Object.assign(new Error('write denied'), { code: 'EACCES' }),
  ]) {
    let attempts = 0;
    await assert.rejects(
      installPackages(
        'uv',
        [],
        {},
        () => {},
        async () => {
          attempts++;
          throw input;
        },
        async () => 'https://first.invalid/',
      ),
      (error) => {
        assert.ok(['ENOSPC', 'EACCES'].includes(error.code));
        assert.equal(error.cause, input);
        assert.ok(!/网络|proxy/.test(error.message));
        assert.ok(!/[\u4e00-\u9fff]/.test(errorMessage(error, true)));
        return true;
      },
    );
    assert.equal(attempts, 1);
  }
  assert.equal(localFailure(new Error('HTTP 403 access denied')), null);
  assert.equal(
    localFailure(
      new Error('wrapped', { cause: Object.assign(new Error('full'), { code: 'ENOSPC' }) }),
    ).code,
    'ENOSPC',
  );
});
test('requested CPU and CUDA flavors are pinned even when an installed flavor satisfies the base version', async () => {
  for (const mode of ['cpu', 'cuda']) {
    let invocation;
    await installTorch(
      'uv',
      ['pip', 'install', 'torch==2.8.0+cu126', 'torchaudio==2.8.0', 'torchvision==0.23.0'],
      {},
      () => {},
      async (_exe, args) => {
        invocation = args;
      },
      mode,
      'official',
    );
    const flavor = mode === 'cuda' ? 'cu128' : 'cpu';
    assert.ok(invocation.includes('torch==2.8.0+' + flavor));
    assert.ok(invocation.includes('torchaudio==2.8.0+' + flavor));
    assert.ok(invocation.includes('torchvision==0.23.0+' + flavor));
    assert.equal(invocation.at(-1), 'https://download.pytorch.org/whl/' + flavor + '/');
  }
});
test('space budgets account for unpacked environments and allow an already-ready matching environment', () => {
  const io = {
    existsSync: () => true,
    readFileSync: () => JSON.stringify({ recipe: 3, mode: 'cpu', flavor: 'cpu' }),
    statfsSync: () => ({ bsize: 1, bavail: 512 * 1024 ** 2 }),
  };
  assert.ok(checkSpace(path.resolve('fixture'), 'cpu', [], io).available > 0);
  assert.throws(
    () => checkSpace(path.resolve('fixture'), 'cuda', [], io),
    (error) => error.code === 'ENOSPC' && /GiB/.test(error.message),
  );
  assert.ok(requiredSpace(path.resolve('fixture'), 'cuda', [], io) > 1024 ** 3);
  const missing = { ...io, existsSync: (value) => !String(value).endsWith('verified.json') };
  assert.equal(
    requiredSpace(path.resolve('fixture'), 'cpu', ['model'], missing),
    requiredSpace(path.resolve('fixture'), 'cpu', [], missing) + 1024 ** 3,
  );
});
test('space failure occurs before runtime download or committing new installation configuration', async (t) => {
  const folder = area(t),
    app = path.join(folder, 'program'),
    data = path.join(folder, 'data');
  fs.mkdirSync(app);
  const configuration = path.join(app, 'installation.json');
  fs.writeFileSync(configuration, JSON.stringify({ schemaVersion: 1, dataRoot: data }));
  const before = fs.readFileSync(configuration);
  let downloads = 0;
  await assert.rejects(
    require('../desktop/installation.cjs').prepare(
      {
        installRoot: app,
        dataRoot: data,
        mode: 'cpu',
        models: [],
        allowSystemDrive: true,
      },
      {
        preflight: () => {
          throw Object.assign(new Error('no space'), { code: 'ENOSPC' });
        },
        runtime: async () => {
          downloads++;
        },
      },
    ),
    (error) => error.code === 'ENOSPC',
  );
  assert.equal(downloads, 0);
  assert.deepEqual(fs.readFileSync(configuration), before);
});
test(
  'Windows non-system paths need no consent, while system-drive data is rejected without consent',
  { skip: process.platform !== 'win32' },
  () => {
    const system = process.env.SystemDrive || 'C:';
    const other = system.toUpperCase() === 'Z:' ? 'Y:' : 'Z:';
    const app = other + '\\AuditProgram';
    assert.equal(validateRoot(other + '\\AuditData', app, false), other + '\\AuditData');
    assert.throws(() => validateRoot(system + '\\AuditData', app, false), /系统盘/);
    assert.equal(validateRoot(system + '\\AuditData', app, true), system + '\\AuditData');
    assert.throws(
      () => validateRoot(other + '\\Parent', other + '\\Parent\\Program', false),
      /独立/,
    );
  },
);
test('GPU readiness requires a real kernel, not only a visible device', async () => {
  const good = createGpuProbe((_exe, args, options, done) => {
    assert.match(args[1], /device='cuda'/);
    assert.match(args[1], /x @ x/);
    assert.equal(options.windowsHide, true);
    done(null, 'IMMERSE_GPU_READY\n', '');
  });
  assert.equal((await good('python')).ready, true);
  const unsupported = createGpuProbe((_exe, _args, _options, done) =>
    done(new Error('failed'), '', 'no kernel image is available'),
  );
  const result = await unsupported('python');
  assert.equal(result.ready, false);
  assert.match(result.detail, /no kernel image/);
});
test('a model write failure stops mirror fallback and preserves the real storage reason', async (t) => {
  const folder = area(t),
    destination = path.join(folder, 'model.bin');
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Length': 128 });
    response.end(Buffer.alloc(128, 1));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const originalOpen = fs.openSync,
    originalWrite = fs.writeSync;
  let downloadFd;
  fs.openSync = function (file, ...args) {
    const fd = originalOpen.call(fs, file, ...args);
    if (String(file).startsWith(destination)) downloadFd = fd;
    return fd;
  };
  fs.writeSync = function (fd, ...args) {
    if (fd === downloadFd) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    return originalWrite.call(fs, fd, ...args);
  };
  t.after(() => {
    fs.openSync = originalOpen;
    fs.writeSync = originalWrite;
  });
  const requests = [];
  server.on('request', (request) => requests.push(request.url));
  const origin = 'http://127.0.0.1:' + server.address().port;
  await assert.rejects(
    require('../desktop/runtime.cjs').downloadSources(
      [origin + '/first', origin + '/second'],
      destination,
    ),
    (error) => error.code === 'ENOSPC',
  );
  assert.ok(requests.length > 0);
  assert.ok(!requests.includes('/second'));
});
