const fs = require('node:fs'),
  path = require('node:path'),
  crypto = require('node:crypto');
(async () => {
  for (const model of require('../platforms/android/model-catalog.json').filter(
    (item) => item.bundled,
  )) {
    const dir = path.resolve('.runtime/android/models');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, model.file);
    if (
      fs.existsSync(dest) &&
      crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex') === model.sha256
    )
      continue;
    const response = await fetch(model.modelUrl);
    if (!response.ok) throw new Error('Model download failed: ' + response.status);
    const temporary = dest + '.part';
    await require('node:stream/promises').pipeline(
      require('node:stream').Readable.fromWeb(response.body),
      fs.createWriteStream(temporary),
    );
    if (
      crypto.createHash('sha256').update(fs.readFileSync(temporary)).digest('hex') !== model.sha256
    ) {
      fs.unlinkSync(temporary);
      throw new Error('Model checksum mismatch');
    }
    fs.renameSync(temporary, dest);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
