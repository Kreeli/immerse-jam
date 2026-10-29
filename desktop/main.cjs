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
      .then(() => setup.prepare({ ...input, legacyRoot }))
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
  require('./locations.cjs').configure(app, path.dirname(process.execPath));
  require('./application.cjs');
}
