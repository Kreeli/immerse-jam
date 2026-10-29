const { audioToolPath, ensureAudioTools } = require('./audio-tools.cjs');
const { text: t, nativeDialogs } = require('./locale.cjs');
const { app, BrowserWindow, ipcMain, dialog, protocol, net, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { Store, atomicJson } = require('./store.cjs');
const { ensureRuntime } = require('./runtime.cjs');
const { Jobs } = require('./jobs.cjs');
const { Models } = require('./models.cjs');
const { importArchive, pack } = require('./archive.cjs');
const { Transfer } = require('./transfer.cjs');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'immerse',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
const { PeerFiles } = require('./peer-files.cjs');
const { scanDatabase, importDatabase } = require('./migration.cjs');
if (process.env.IMMERSE_PROFILE_DIR) {
  fs.mkdirSync(process.env.IMMERSE_PROFILE_DIR, { recursive: true });
  app.setPath('userData', path.resolve(process.env.IMMERSE_PROFILE_DIR));
}
const development = !app.isPackaged;
const root = path.resolve(__dirname, '..');
let win,
  store,
  jobs,
  models,
  transfer,
  peerFiles,
  takes,
  installing = false,
  pending = false;
const base =
  process.env.IMMERSE_DATA_DIR ||
  (development
    ? path.join(root, '.runtime', 'data')
    : path.join(app.getPath('userData'), 'library'));
const runtimeBase =
  process.env.IMMERSE_RUNTIME_DIR ||
  (development ? path.join(root, '.runtime') : path.join(app.getPath('userData'), 'runtime'));
const python = path.join(runtimeBase, 'venv', 'Scripts', 'python.exe');
const backend = app.isPackaged
  ? path.join(process.resourcesPath, 'backend')
  : path.join(root, 'backend');
const ffmpeg = audioToolPath(runtimeBase);
if (development && !fs.existsSync(ffmpeg)) {
  const local = path.join(root, 'node_modules/ffmpeg-static/ffmpeg.exe');
  if (fs.existsSync(local)) {
    fs.mkdirSync(path.dirname(ffmpeg), { recursive: true });
    fs.copyFileSync(local, ffmpeg);
  }
}
function emit(data) {
  if (win && !win.isDestroyed()) win.webContents.send('jam:event', data);
}
function runtimeStatus() {
  return {
    ready:
      fs.existsSync(path.join(runtimeBase, 'ready.json')) &&
      fs.existsSync(python) &&
      fs.existsSync(ffmpeg),
    installing,
    mode: fs.existsSync(path.join(runtimeBase, 'ready.json'))
      ? JSON.parse(fs.readFileSync(path.join(runtimeBase, 'ready.json'))).mode
      : null,
  };
}
async function pick(filters, multiple = true) {
  return nativeDialogs.showOpenDialog(win, {
    properties: ['openFile', ...(multiple ? ['multiSelections'] : [])],
    filters,
  });
}
async function importFiles(files) {
  const result = [];
  for (const file of files) {
    if (/\.(aum|ijam)$/i.test(file)) result.push(await importArchive(store, file));
    else if (/\.(mp3|wav|flac|m4a|aac|ogg|opus|mp4|mov|webm)$/i.test(file))
      result.push(store.create(file));
    else throw new Error('不支持此文件类型');
  }
  emit({ type: 'library-changed' });
  return result;
}
function handle(name, fn) {
  ipcMain.handle('jam:' + name, async (event, data) => {
    if (event.sender !== win.webContents) throw new Error('无效调用来源');
    return fn(data || {});
  });
}
ipcMain.on('jam:initial-ui', (event) => {
  event.returnValue = { language: process.env.IMMERSE_LOCALE || null };
});
app.whenReady().then(async () => {
  store = new Store(base);
  takes = new (require('./takes.cjs').Takes)(store, ffmpeg);
  models = new Models(runtimeBase);
  jobs = new Jobs({ base: runtimeBase, backend, ffmpeg, onEvent: emit });
  transfer = new Transfer(store, emit);
  peerFiles = new PeerFiles(store, emit);
  protocol.handle('immerse', (request) => {
    try {
      const u = new URL(request.url);
      if (u.hostname === 'asset') {
        const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
        const id = parts.shift();
        return net.fetch(pathToFileURL(store.asset(id, parts.join('/'))).toString(), {
          headers: request.headers,
        });
      }
      return new Response('Not found', { status: 404 });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#111114',
    title: 'Immerse Jam',
    icon: path.join(app.isPackaged ? process.resourcesPath : root, 'assets', 'app-icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = process.env.IMMERSE_DEV_URL
      ? url.startsWith(process.env.IMMERSE_DEV_URL + '/')
      : url.startsWith(pathToFileURL(path.join(root, 'dist')).href);
    if (!allowed) e.preventDefault();
  });
  handle('open-license-folder', async () => {
    const error = await shell.openPath(
      path.join(app.isPackaged ? process.resourcesPath : root, 'assets/licenses'),
    );
    if (error) throw new Error(error);
    return true;
  });
  handle('ui-language', ({ language }) => {
    process.env.IMMERSE_UI_LANGUAGE = language === 'en' ? 'en' : 'zh-CN';
    return true;
  });
  handle('library', () => store.list());
  handle('project-delete', async ({ id }) => {
    if (jobs.active) throw new Error('请先等待处理任务完成或取消，再删除项目');
    if ([...takes.sessions.values()].some((session) => session.projectId === id))
      throw new Error('请先停止录音，再删除工程');
    store.get(id);
    const folder = path.resolve(store.dir(id));
    if (
      path.dirname(folder) !== path.resolve(store.projects) ||
      fs.lstatSync(folder).isSymbolicLink()
    )
      throw new Error('无效项目目录');
    await shell.trashItem(folder);
    emit({ type: 'library-changed' });
    return true;
  });
  require('./ipc/recordings.cjs')({ handle, store, takes, emit, pick, runtimeBase, base });

  handle('import', async (data) => {
    let files = data.paths;
    if (!files) {
      const selection = await pick([
        {
          name: '音频或歌曲项目',
          extensions: [
            'mp3',
            'wav',
            'flac',
            'm4a',
            'aac',
            'ogg',
            'opus',
            'mp4',
            'webm',
            'aum',
            'ijam',
          ],
        },
      ]);
      if (selection.canceled) return [];
      files = selection.filePaths;
    }
    return importFiles(files);
  });
  handle('update', ({ id, patch }) => store.update(id, patch));
  handle('attach', async (data) => {
    const p = store.get(data.id);
    if (data.midiBytes) {
      if (data.midiBytes.length > 30 * 1024 ** 2) throw new Error('MIDI 文件过大');
      const rel = 'attachments/alignment.mid';
      fs.mkdirSync(path.dirname(store.asset(p.id, rel)), { recursive: true });
      const bytes = Buffer.from(data.midiBytes),
        target = store.asset(p.id, rel);
      if (!fs.existsSync(target) || !fs.readFileSync(target).equals(bytes)) p.alignment = null;
      fs.writeFileSync(target, bytes);
      p.scoreMidi = rel;
      return store.save(p);
    }
    const selected = await pick([
      {
        name: '乐谱、MIDI 或附件',
        extensions: [
          'gp',
          'gp3',
          'gp4',
          'gp5',
          'gpx',
          'gtp',
          'xml',
          'musicxml',
          'mxl',
          'mid',
          'midi',
          'pdf',
          'png',
          'jpg',
          'txt',
        ],
      },
    ]);
    if (selected.canceled) return p;
    for (const file of selected.filePaths) {
      const id = crypto.randomUUID(),
        relative = 'attachments/' + id + path.extname(file).toLowerCase();
      fs.mkdirSync(path.dirname(store.asset(p.id, relative)), { recursive: true });
      fs.copyFileSync(file, store.asset(p.id, relative));
      p.attachments.push({ id, name: path.basename(file), file: relative });
    }
    return store.save(p);
  });
  handle('read-attachment', ({ id, attachmentId }) => {
    const p = store.get(id),
      a = p.attachments.find((x) => x.id === attachmentId);
    if (!a) throw new Error('附件不存在');
    if (fs.statSync(store.asset(id, a.file)).size > 40 * 1024 ** 2)
      throw new Error('乐谱附件超过 40 MB');
    return new Uint8Array(fs.readFileSync(store.asset(id, a.file)));
  });
  handle('runtime-status', runtimeStatus);
  handle('runtime-install', ({ mode }) => {
    if (installing) return runtimeStatus();
    installing = true;
    ensureRuntime(runtimeBase, mode === 'cuda' ? 'cuda' : 'cpu', (e) =>
      emit({ scope: 'runtime', ...e }),
    )
      .then(() => ensureAudioTools(runtimeBase, (e) => emit({ scope: 'runtime', ...e })))
      .then(() => emit({ type: 'runtime-ready', ...runtimeStatus() }))
      .catch((error) => emit({ type: 'error', scope: 'runtime', message: error.message }))
      .finally(() => {
        installing = false;
        emit({ type: 'runtime-status', ...runtimeStatus() });
      });
    return { installing: true };
  });
  handle('result-select', ({ id, resultId }) => store.selectResult(id, resultId));
  handle('result-rename', ({ id, resultId, name }) => store.renameResult(id, resultId, name));
  handle('result-open', async ({ id, resultId }) => {
    const p = store.get(id);
    const result = resultId ? p.results.find((item) => item.id === resultId) : null;
    if (resultId && !result) throw new Error('分离结果不存在');
    const target = result ? store.asset(id, result.directory) : store.dir(id);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return true;
  });
  handle('models', () => models.list());
  handle('model-download', async ({ id }) => {
    try {
      emit({
        scope: 'model-download',
        modelId: id,
        type: 'progress',
        progress: 0,
        message: '正在准备下载…',
      });
      await models.ensure(id, (e) => emit({ ...e, scope: 'model-download', modelId: id }));
      emit({
        scope: 'model-download',
        modelId: id,
        type: 'complete',
        progress: 1,
        message: '模型已下载并校验',
      });
      return models.list();
    } catch (error) {
      emit({ scope: 'model-download', modelId: id, type: 'error', message: error.message });
      throw error;
    }
  });
  handle('model-import', async () => {
    if (!runtimeStatus().ready) throw new Error('请先准备本地运行环境');
    const s = await nativeDialogs.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: '选择包含 manifest.json 的模型文件夹',
    });
    if (s.canceled) return null;
    const model = models.import(s.filePaths[0]);
    jobs.start(python, { operation: 'validate-model', model }, (r) => {
      atomicJson(path.join(model.directory, 'verified.json'), r);
      return r;
    });
    return model;
  });
  handle('run', async (data) => {
    if (!runtimeStatus().ready) throw new Error('请先在设置中准备本地运行环境');
    if (pending || jobs.active) throw new Error('已有处理任务，请完成或取消后再试');
    pending = true;
    try {
      const p = store.get(data.id);
      const request = {
        operation: data.operation,
        projectId: p.id,
        directory: store.dir(p.id),
        source: store.asset(p.id, p.playback || p.original),
      };
      if (data.operation === 'separate') {
        request.mode = data.mode;
        request.model = await models.ensure(data.modelId || 'roformer-sw', (e) =>
          emit({ ...e, projectId: p.id, operation: 'separate' }),
        );
        if (
          data.mode === 'six' &&
          !['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'].every((s) =>
            request.model.stems.includes(s),
          )
        )
          throw new Error('完整六轨模式需要选择六轨模型');
        if (data.mode === 'guitarist' || data.mode === 'singer')
          request.secondaryModel = await models.ensure(
            data.mode === 'guitarist' ? 'guitar-lead' : 'karaoke',
            (e) => emit({ ...e, projectId: p.id, operation: 'separate' }),
          );
      }
      if (data.operation === 'analyze') {
        try {
          request.tempoModel = await models.ensure('beat-this', (e) =>
            emit({ ...e, projectId: p.id, operation: 'analyze' }),
          );
        } catch (error) {
          emit({
            type: 'progress',
            projectId: p.id,
            operation: 'analyze',
            message: '节拍模型尚未准备好，将使用基础 BPM 估计',
          });
        }
      }
      if (data.operation === 'align') {
        if (!p.scoreMidi) throw new Error('请先打开乐谱或 MIDI 附件');
        request.midi = store.asset(p.id, p.scoreMidi);
      }
      if (!['prepare', 'analyze', 'align', 'separate'].includes(data.operation))
        throw new Error('不支持的处理操作');
      return jobs.start(python, request, (result) =>
        data.operation === 'separate'
          ? store.addResult(p.id, result, {
              modelId: request.model.id,
              modelName: request.model.name,
              mode: request.mode,
            })
          : store.save({ ...store.get(p.id), ...result }),
      );
    } finally {
      pending = false;
    }
  });
  handle('cancel', ({ jobId }) => jobs.cancel(jobId));
  handle('export', async ({ id, full }) => {
    const p = store.get(id);
    const s = await nativeDialogs.showSaveDialog(win, {
      defaultPath: p.title.replace(/[<>:"/\\|?*]/g, '_') + '.ijam',
      filters: [{ name: 'Immerse Jam 项目', extensions: ['ijam'] }],
    });
    if (s.canceled) return null;
    await pack(store, id, s.filePath, !!full);
    return s.filePath;
  });
  handle('export-audio', async (data) => {
    const { exportMix, exportStems } = require('./export-audio.cjs');
    if (data.stems) {
      const s = await nativeDialogs.showOpenDialog(win, { properties: ['openDirectory'] });
      return s.canceled ? null : exportStems(store, data.id, s.filePaths[0]);
    }
    const p = store.get(data.id);
    const s = await nativeDialogs.showSaveDialog(win, {
      defaultPath: p.title.replace(/[<>:"/\\|?*]/g, '_') + '_mix.wav',
      filters: [
        { name: '无损 WAV', extensions: ['wav'] },
        { name: 'MP3', extensions: ['mp3'] },
      ],
    });
    if (s.canceled) return null;
    await ensureAudioTools(runtimeBase, (e) => emit({ ...e, scope: 'audio-tools' }));
    return exportMix(store, data.id, ffmpeg, s.filePath, data.region);
  });

  handle('pick-folder', async () => {
    const s = await nativeDialogs.showOpenDialog(win, { properties: ['openDirectory'] });
    return s.canceled ? null : s.filePaths[0];
  });
  handle('migration-scan', async (data) => {
    const folder = data.folder;
    if (!folder)
      return { items: [], message: '选择 Audio Jam 导出文件所在文件夹，可批量导入 .aum' };
    const items = [];
    function scan(dir, depth) {
      if (depth > 4) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isSymbolicLink()) continue;
        const file = path.join(dir, e.name);
        if (e.isDirectory()) scan(file, depth + 1);
        else if (/\.aum$/i.test(e.name))
          items.push({ file, name: e.name, size: fs.statSync(file).size });
        if (items.length > 1000) return;
      }
    }
    scan(folder, 0);
    return { items };
  });
  handle('migration-import', ({ files }) => importFiles(files));
  handle('migration-detect', () => {
    const candidates = [
      path.join(app.getPath('documents'), 'AumDb'),
      path.join(process.env.USERPROFILE || '', 'Documents', 'AumDb'),
      path.join(process.env.USERPROFILE || '', 'OneDrive', 'Documents', 'AumDb'),
    ];
    return candidates
      .filter((f, i) => candidates.indexOf(f) === i && fs.existsSync(path.join(f, 'index.db')))
      .map(scanDatabase);
  });
  handle('migration-database-scan', ({ folder }) => scanDatabase(folder));
  handle('migration-database-import', ({ folder, ids }) => {
    const result = importDatabase(store, folder, ids);
    emit({ type: 'library-changed' });
    return result;
  });
  handle('pair-start', ({ ids }) => transfer.start(ids));
  handle('pair-stop', () => transfer.stop());
  handle('peer-prepare', ({ ids }) => peerFiles.prepare(ids));
  handle('peer-outgoing', () => [...peerFiles.outgoing.values()].map(({ file, ...item }) => item));
  handle('peer-read', (data) => peerFiles.read(data));
  handle('peer-begin', (data) => peerFiles.begin(data));
  handle('peer-append', (data) => peerFiles.append(data));
  handle('peer-finish', (data) => peerFiles.finish(data));
  handle('peer-close', () => peerFiles.close());
  handle('peer-select', async (data) => {
    const item = peerFiles.pending.get(data.id);
    if (!item) throw new Error('待接收文件不存在');
    const result = data.accept ? await importFiles([item.file]) : null;
    peerFiles.pending.delete(data.id);
    fs.rmSync(item.file, { force: true });
    return result;
  });
  handle('pair-select', async (data) => {
    const item = transfer.pending?.get(data.id);
    if (!item) throw new Error('待接收文件不存在');
    if (!data.accept) {
      transfer.pending.delete(data.id);
      fs.rmSync(item.file, { force: true });
      return null;
    }
    const result = await importFiles([item.file]);
    if (result.length === 1 && !/\.(ijam|aum)$/i.test(item.name))
      result[0] = store.update(result[0].id, {
        title: path.basename(item.name, path.extname(item.name)),
      });
    transfer.pending.delete(data.id);
    fs.rmSync(item.file, { force: true });
    return result;
  });
  handle('reveal', ({ id }) => shell.showItemInFolder(path.join(store.dir(id), 'project.json')));
  handle('window', ({ action }) => {
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  if (process.env.IMMERSE_DEV_URL) await win.loadURL(process.env.IMMERSE_DEV_URL);
  else await win.loadFile(path.join(root, 'dist', 'index.html'));
});
app.on('window-all-closed', () => {
  takes?.close();
  jobs?.close();
  transfer?.stop();
  peerFiles?.close();
  app.quit();
});
