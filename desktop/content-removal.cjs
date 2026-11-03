const fs = require('node:fs');
const { referencedFiles } = require('../shared/project-validation.cjs');

// Commit the manifest first; remove only files no longer referenced by this project.
function removeContent(store, id, itemId, kind) {
  const p = store.get(id);
  const candidates = new Set();
  if (kind === 'attachment') {
    const item = p.attachments.find((a) => a.id === itemId);
    if (!item) throw new Error('附件不存在');
    candidates.add(item.file);
    p.attachments = p.attachments.filter((a) => a.id !== itemId);
    if (/\.(gp[345x]?|gtp|musicxml|mxl|xml|mid|midi)$/i.test(item.name)) {
      if (p.scoreMidi) candidates.add(p.scoreMidi);
      p.scoreMidi = null;
      p.alignment = null;
    }
  } else {
    if (p.kind !== 'creation') throw new Error('分轨分组数据无效');
    if (itemId === 'source' && p.sessionSource) {
      delete p.sessionSource;
      delete p.sourceMix;
    } else {
      const group = (p.sourceGroups || []).find((g) => g.id === itemId);
      if (!group) throw new Error('分轨分组数据无效');
      group.tracks.forEach((t) => candidates.add(t.file));
      p.sourceGroups = p.sourceGroups.filter((g) => g.id !== itemId);
    }
  }
  const remaining = new Set(referencedFiles(p));
  const paths = [...candidates]
    .filter((file) => !remaining.has(file))
    .map((file) => store.asset(id, file));
  const saved = store.save(p);
  for (const file of paths) fs.rmSync(file, { force: true });
  return saved;
}
module.exports = { removeContent };
