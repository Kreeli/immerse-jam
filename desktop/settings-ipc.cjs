const { SettingsStorage } = require('./settings-storage.cjs');
module.exports = function registerSettings({
  handle,
  app,
  shell,
  clipboard,
  getWindow,
  roots,
  isBusy,
  getState,
}) {
  const storage = new SettingsStorage({ ...roots, isBusy });
  storage.paths.installLog = require('node:path').join(
    require('node:path').dirname(roots.library),
    'installation.log',
  );
  handle('settings-storage', () => storage.info());
  handle('settings-cleanup-preview', ({ category }) => storage.preview(category));
  handle('settings-cleanup', ({ token }) => storage.clear(token));
  handle('settings-open-location', async ({ id }) => {
    const error = await shell.openPath(await storage.location(id));
    if (error) throw new Error(error);
    return true;
  });
  const diagnostics = () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    ...getState(),
    locations: storage.paths,
  });
  handle('settings-diagnostics', diagnostics);
  handle('settings-copy-diagnostics', () => {
    clipboard.writeText(JSON.stringify(diagnostics(), null, 2));
    return true;
  });
  handle('ui-scale', ({ scale }) => {
    if (typeof scale !== 'number' || !Number.isFinite(scale) || scale < 0.8 || scale > 1.5)
      throw new Error('界面缩放需要在80%至150%之间');
    const contents = getWindow().webContents;
    if (contents.getZoomFactor() !== scale) contents.setZoomFactor(scale);
    return { scale: contents.getZoomFactor() };
  });
  return storage;
};
