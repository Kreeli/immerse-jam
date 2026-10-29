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
    const verified =
      fs.existsSync(dest) &&
      crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex') === model.sha256;
    const melOK =
      !model.melFile ||
      (fs.existsSync(path.join(dir, model.melFile)) &&
        crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(dir, model.melFile)))
          .digest('hex') === model.melSha256);
    if (verified && melOK) continue;
    if (model.adapter === 'beat-this') {
      const checkpoint = path.resolve('.runtime/android/source/final0.ckpt');
      fs.mkdirSync(path.dirname(checkpoint), { recursive: true });
      const expected = '8c328b45f59d8dd3dff219253ff6a8d6482be57d0133a29140e2febbf8eb8331';
      if (
        !fs.existsSync(checkpoint) ||
        crypto.createHash('sha256').update(fs.readFileSync(checkpoint)).digest('hex') !== expected
      ) {
        const response = await fetch(
          'https://cloud.cp.jku.at/public.php/dav/files/7ik4RrBKTS273gp/final0.ckpt',
        );
        if (!response.ok) throw new Error('Beat checkpoint download failed');
        const bytes = Buffer.from(await response.arrayBuffer());
        if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
          throw new Error('Beat checkpoint checksum mismatch');
        fs.writeFileSync(checkpoint, bytes);
      }
      const local = path.resolve('.runtime/venv/Scripts/python.exe');
      const result = require('node:child_process').spawnSync(
        fs.existsSync(local) ? local : process.env.PYTHON || 'python',
        ['scripts/export-android-beats.py', '--checkpoint', checkpoint, '--output', dir],
        { stdio: 'inherit', windowsHide: true },
      );
      if (result.status !== 0)
        throw new Error(
          'Beat This! conversion requires the developer Python dependencies; see platforms/android/README.md.',
        );
      if (crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex') !== model.sha256)
        throw new Error('Exported Beat model checksum mismatch');
      continue;
    }
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
