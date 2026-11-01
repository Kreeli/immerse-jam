const fs = require('node:fs'),
  path = require('node:path');
const { catalog } = require('../desktop/models.cjs');
const { copyVerified, hash } = require('../desktop/installer-assets.cjs');
const root = path.resolve(__dirname, '..'),
  release = path.join(root, 'release');
async function backup() {
  const target = path.resolve(process.argv[2] || path.join(release, 'model-backup-2026-11-02'));
  if (!target.startsWith(release + path.sep))
    throw new Error('模型备份需要位于项目 release 目录内');
  const files = [];
  for (const model of catalog) {
    const artifacts = [
      { file: model.file, sha256: model.sha256, url: model.modelUrl },
      ...(model.config
        ? [{ file: model.config, sha256: model.configSha256, url: model.configUrl }]
        : []),
      ...(model.extraFiles || []),
    ];
    for (const item of artifacts) {
      const relative = 'models/' + model.id + '/' + item.file;
      const source = path.join(root, '.runtime', relative),
        destination = path.join(target, relative);
      if (!fs.existsSync(destination) || (await hash(destination)) !== item.sha256)
        await copyVerified(source, destination, item.sha256);
      files.push({
        model: model.id,
        file: relative,
        sha256: item.sha256,
        size: fs.statSync(destination).size,
        upstream: item.url,
      });
    }
    console.log('Archived local model: ' + model.id);
  }
  fs.writeFileSync(
    path.join(target, 'manifest.json'),
    JSON.stringify(
      {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        scope:
          'Local preservation of installed checkpoints; no new redistribution license is granted.',
        files,
      },
      null,
      2,
    ) + '\n',
  );
  fs.writeFileSync(
    path.join(target, 'SHA256SUMS.txt'),
    files.map((item) => item.sha256 + '  ' + item.file).join('\n') + '\n',
  );
  console.log('Backup complete: ' + target);
}
backup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
