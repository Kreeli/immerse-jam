const fs = require('node:fs'),
  path = require('node:path'),
  { execFile } = require('node:child_process'),
  { promisify } = require('node:util');
const { validateRoot } = require('./locations.cjs'),
  { atomicJson } = require('./store.cjs');
const { ensureRuntime } = require('./runtime.cjs'),
  { ensureAudioTools } = require('./audio-tools.cjs'),
  { Models, catalog } = require('./models.cjs');
const modelChoices = [
  'roformer-sw',
  'demucs-6',
  'scnet-small',
  'karaoke',
  'guitar-lead',
  'beat-this',
];
function options(argv) {
  const get = (name) =>
    argv.find((value) => value.startsWith('--' + name + '='))?.slice(name.length + 3);
  const mode = get('runtime-mode') || 'auto',
    models = (get('models') || '').split(',').filter(Boolean);
  if (!['auto', 'cpu', 'cuda'].includes(mode) || models.some((id) => !modelChoices.includes(id)))
    throw new Error('安装组件选择无效');
  if (
    models.some((id) => ['karaoke', 'guitar-lead'].includes(id)) &&
    !models.includes('roformer-sw')
  )
    models.unshift('roformer-sw');
  return {
    dataRoot: get('data-root'),
    installRoot: get('install-root') || path.dirname(process.execPath),
    mode,
    models: [...new Set(models)],
    allowSystemDrive: get('allow-system-drive') === '1',
  };
}
async function prepare(input, services = {}) {
  if (
    !['auto', 'cpu', 'cuda'].includes(input.mode) ||
    !Array.isArray(input.models) ||
    input.models.some((id) => !modelChoices.includes(id))
  )
    throw new Error('安装组件选择无效');
  const installRoot = path.resolve(input.installRoot),
    dataRoot = validateRoot(input.dataRoot, installRoot, input.allowSystemDrive),
    runtime = path.join(dataRoot, 'runtime');
  fs.mkdirSync(dataRoot, { recursive: true });
  const probe = path.join(dataRoot, '.write-test-' + require('node:crypto').randomUUID());
  fs.writeFileSync(probe, '');
  fs.unlinkSync(probe);
  const log = (event) => {
    if (event.message) {
      const text = event.message.replace(/\x1b\[[0-9;]*m/g, '');
      console.log(text);
      fs.appendFileSync(
        path.join(dataRoot, 'installation.log'),
        new Date().toISOString() + ' ' + text + '\n',
      );
    }
  };
  log({ message: 'Data: ' + dataRoot });
  if (
    input.legacyRoot &&
    path.resolve(input.legacyRoot) !== dataRoot &&
    !fs.existsSync(path.join(dataRoot, 'legacy-imported.json'))
  ) {
    const source = path.resolve(input.legacyRoot);
    if (fs.existsSync(path.join(source, 'library', 'projects'))) {
      log({ message: 'Copying existing library and preferences to the chosen data folder...' });
      await fs.promises.cp(path.join(source, 'library'), path.join(dataRoot, 'library'), {
        recursive: true,
        force: false,
        errorOnExist: false,
      });
      for (const name of ['Local Storage', 'IndexedDB', 'Preferences']) {
        if (fs.existsSync(path.join(source, name)))
          await fs.promises.cp(path.join(source, name), path.join(dataRoot, 'profile', name), {
            recursive: true,
            force: false,
            errorOnExist: false,
          });
      }
      // Environments contain absolute interpreter paths; rebuild them at the destination.
      const oldModels = path.join(source, 'runtime', 'models');
      if (fs.existsSync(oldModels))
        await fs.promises.cp(oldModels, path.join(runtime, 'models'), {
          recursive: true,
          force: false,
          errorOnExist: false,
        });
      atomicJson(path.join(dataRoot, 'legacy-imported.json'), {
        source,
        copiedAt: new Date().toISOString(),
      });
    }
  }
  let mode = input.mode;
  if (mode === 'auto') {
    try {
      await promisify(execFile)('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
        windowsHide: true,
        timeout: 10000,
      });
      mode = 'cuda';
    } catch {
      mode = 'cpu';
    }
  }
  const python = await (services.runtime || ensureRuntime)(runtime, mode, log);
  if (mode === 'cuda' && !services.runtime) {
    const result = await promisify(execFile)(
      python,
      ['-c', 'import torch; print(int(torch.cuda.is_available()))'],
      { windowsHide: true, timeout: 60000 },
    );
    if (result.stdout.trim() !== '1') {
      if (input.mode === 'cuda')
        throw new Error('NVIDIA 驱动不兼容，请重新安装并选择 CPU 或自动模式');
      mode = 'cpu';
      log({ message: 'NVIDIA acceleration unavailable; preparing CPU runtime.' });
      await ensureRuntime(runtime, mode, log);
    }
  }
  await (services.audio || ensureAudioTools)(runtime, log);
  const models = services.models || new Models(runtime);
  for (const id of input.models) {
    if (!modelChoices.includes(id) || !catalog.some((model) => model.id === id))
      throw new Error('安装组件选择无效');
    await models.ensure(id, log);
  }
  fs.mkdirSync(path.join(dataRoot, 'library'), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, 'profile'), { recursive: true });
  const result = {
    schemaVersion: 1,
    dataRoot,
    runtimeMode: mode,
    models: input.models,
    installedAt: new Date().toISOString(),
  };
  atomicJson(path.join(installRoot, 'installation.json'), result);
  log({ message: 'Installation preparation complete' });
  return result;
}
async function run(argv) {
  return prepare(options(argv));
}
module.exports = { options, prepare, run, modelChoices };
