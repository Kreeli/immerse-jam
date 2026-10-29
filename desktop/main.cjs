const path = require('node:path');
const { app } = require('electron');
if (process.argv.includes('--prepare-installation')) {
  app.disableHardwareAcceleration();
  try {
    const setup = require('./installation.cjs'),
      input = setup.options(process.argv),
      legacyRoot = app.getPath('userData');
    const dataRoot = require('./locations.cjs').validateRoot(
      input.dataRoot,
      input.installRoot,
      input.allowSystemDrive,
    );
    const fs = require('node:fs');
    for (const name of ['setup-profile', 'logs', 'crashes'])
      fs.mkdirSync(path.join(dataRoot, name), { recursive: true });
    app.setPath('userData', path.join(dataRoot, 'setup-profile'));
    app.setPath('sessionData', path.join(dataRoot, 'setup-profile'));
    app.setPath('logs', path.join(dataRoot, 'logs'));
    app.setPath('crashDumps', path.join(dataRoot, 'crashes'));
    app
      .whenReady()
      .then(() =>
        setup.prepare({
          ...input,
          legacyRoot:
            input.legacyRoot ||
            (require('node:fs').existsSync(path.join(input.installRoot, 'installation.json'))
              ? undefined
              : legacyRoot),
        }),
      )
      .then(() => app.exit(0))
      .catch((error) => {
        console.error(error.message);
        app.exit(1);
      });
  } catch (error) {
    console.error(error.message);
    app.exit(1);
  }
} else {
  const installRoot = path.dirname(process.execPath);
  try {
    require('./locations.cjs').configure(app, installRoot);
    require('./application.cjs');
  } catch (initialError) {
    app.whenReady().then(async () => {
      const { dialog } = require('electron'),
        fs = require('node:fs');
      let error = initialError;
      for (;;) {
        const english = !app.getLocale().startsWith('zh');
        const choice = await dialog.showMessageBox({
          type: 'error',
          title: 'Immerse Jam',
          message: english
            ? 'The data folder is unavailable. Your library has not been replaced.'
            : '数据目录暂时无法访问，原曲库仍保留在原位置。',
          detail: error.message,
          buttons: english
            ? ['Retry', 'Locate existing data folder', 'Exit']
            : ['重试', '重新定位已有数据目录', '退出'],
          cancelId: 2,
        });
        if (choice.response === 2) return app.quit();
        try {
          if (choice.response === 1) {
            const picked = await dialog.showOpenDialog({ properties: ['openDirectory'] });
            if (picked.canceled) continue;
            const root = picked.filePaths[0];
            require('./locations.cjs').validateRoot(root, installRoot, true);
            if (!fs.existsSync(path.join(root, 'library', 'projects')))
              throw new Error(
                english
                  ? 'Select the existing data folder containing library/projects.'
                  : '请选择包含 library/projects 的原数据目录。',
              );
            const file = path.join(installRoot, 'installation.json'),
              config = JSON.parse(fs.readFileSync(file, 'utf8'));
            require('./store.cjs').atomicJson(file, { ...config, dataRoot: root });
          }
          require('./locations.cjs').configure(app, installRoot);
          require('./application.cjs');
          return;
        } catch (next) {
          error = next;
        }
      }
    });
  }
}
