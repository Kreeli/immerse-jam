const test = require('node:test'),
  assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto'),
  http = require('node:http');
const { Models } = require('../desktop/models.cjs');
const { downloadSources } = require('../desktop/runtime.cjs');
const {
  installPackages,
  selectIndex,
  OFFICIAL,
  MIRROR,
  SECOND_MIRROR,
} = require('../desktop/package-index.cjs');
fs.mkdirSync(path.resolve('.runtime/test-workspaces'), { recursive: true });
test('a model installs from verified local components without contacting a download source', async (t) => {
  const area = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/assets-'));
  t.after(() => fs.rmSync(area, { recursive: true, force: true }));
  const previous = process.env.IMMERSE_COMPONENTS_DIR;
  process.env.IMMERSE_COMPONENTS_DIR = path.join(area, 'components');
  t.after(() => {
    if (previous === undefined) delete process.env.IMMERSE_COMPONENTS_DIR;
    else process.env.IMMERSE_COMPONENTS_DIR = previous;
  });
  const source = path.join(process.env.IMMERSE_COMPONENTS_DIR, 'models/fixture/weights.bin');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  const body = Buffer.from('verified local model');
  fs.writeFileSync(source, body);
  const sha256 = crypto.createHash('sha256').update(body).digest('hex');
  const models = new Models(path.join(area, 'runtime'));
  models.get = () => ({
    id: 'fixture',
    name: 'fixture',
    adapter: 'scnet',
    file: 'weights.bin',
    sha256,
    modelUrl: 'https://invalid.invalid/must-not-contact',
  });
  const result = await models.ensure('fixture');
  assert.deepEqual(fs.readFileSync(path.join(result.directory, 'weights.bin')), body);
  assert.ok(fs.existsSync(path.join(result.directory, 'verified.json')));
  fs.writeFileSync(source, 'corrupt');
  const { copyBundled } = require('../desktop/installer-assets.cjs');
  assert.equal(
    await copyBundled('models/fixture/weights.bin', path.join(area, 'corrupt.bin'), sha256),
    false,
  );
  assert.ok(!fs.existsSync(path.join(area, 'corrupt.bin')));
});
test('a corrupt download mirror is rejected and the next source supplies the pinned bytes', async (t) => {
  const area = fs.mkdtempSync(path.resolve('.runtime/test-workspaces/mirror-'));
  t.after(() => fs.rmSync(area, { recursive: true, force: true }));
  const body = Buffer.from('correct upstream weights'),
    requests = [],
    events = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    const bytes = request.url === '/bad' ? Buffer.from('wrong checkpoint') : body;
    response.writeHead(200, { 'Content-Length': bytes.length });
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const destination = path.join(area, 'weights.bin');
  await downloadSources(
    [origin + '/bad', origin + '/good'],
    destination,
    crypto.createHash('sha256').update(body).digest('hex'),
    (event) => events.push(event),
  );
  assert.deepEqual(fs.readFileSync(destination), body);
  assert.ok(requests.includes('/bad') && requests.includes('/good'));
  assert.ok(events.some((event) => event.message.includes('备用源')));
});
test('Python auto starts domestically and failures try a second domestic mirror before PyPI', async () => {
  assert.equal(
    await selectIndex(async () => {
      throw new Error('offline');
    }),
    MIRROR,
  );
  const attempts = [];
  await installPackages(
    'uv',
    ['pip', 'install', 'numpy==2.2.6'],
    {},
    () => {},
    async (_exe, args) => {
      attempts.push(args[args.indexOf('--index-url') + 1]);
      if (attempts.length < 3) throw new Error('mirror incomplete');
    },
    async () => MIRROR,
  );
  assert.deepEqual(attempts, [MIRROR, SECOND_MIRROR, OFFICIAL]);
});
