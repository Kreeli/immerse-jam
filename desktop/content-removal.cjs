const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { referencedFiles } = require('../shared/project-validation.cjs');

function detachSource(p, placeholder) {
  delete p.sessionSource;
  delete p.sourceMix;
  delete p.originalMix;
  delete p.playback;
  if (p.presets)
    p.presets = p.presets.map(({ originalMix, sourceMix, ...preset }) => ({
      ...preset,
      tracks: [],
    }));
  p.tracks = [];
  p.results = [];
  p.activeResultId = null;
  p.original = placeholder;
}

// The previous manifest records exactly which source files the user detached.
// Leave it in place until every unreferenced media file has been removed.
function finishSourceRemoval(store, current) {
  if (current.kind !== 'creation' || current.sessionSource) return;
  const backup = path.join(store.dir(current.id), 'project.previous.json');
  if (!fs.existsSync(backup)) return;
  const before = JSON.parse(fs.readFileSync(backup, 'utf8'));
  if (
    before.id !== current.id ||
    before.kind !== 'creation' ||
    !before.sessionSource ||
    before.original === current.original
  )
    return;
  const key = (file) => (process.platform === 'win32' ? file.toLowerCase() : file);
  const retained = new Set();
  for (const relative of referencedFiles(current)) {
    const file = store.asset(current.id, relative);
    if (fs.existsSync(file)) retained.add(key(fs.realpathSync(file)));
  }
  const sources = referencedFiles({
    original: before.original,
    playback: before.playback,
    originalMix: before.originalMix,
    tracks: before.tracks,
    results: before.results,
  });
  for (const relative of sources) {
    if (!/\.(wav|mp3|m4a|flac|ogg|aac|mp4|mov|webm|opus|aiff?)$/i.test(relative)) continue;
    const file = store.asset(current.id, relative);
    if (
      fs.existsSync(file) &&
      fs.lstatSync(file).isFile() &&
      !retained.has(key(fs.realpathSync(file)))
    )
      fs.unlinkSync(file);
  }
  require('./store.cjs').atomicJson(backup, current);
}

// Commit the manifest first; remove only files no longer referenced by this project.
function removeContent(store, id, itemId, kind) {
  const p = store.get(id);
  const candidates = new Set();
  if (kind === 'attachment') {
    const item = p.attachments.find((a) => a.id === itemId);
    if (!item) throw new Error('附件不存在');
    candidates.add(item.file);
    p.attachments = p.attachments.filter((a) => a.id !== itemId);
    if (
      p.scoreAttachmentId === itemId ||
      (!p.scoreAttachmentId &&
        /\.(gp[345x]?|gtp|musicxml|mxl|xml|mid|midi)$/i.test(item.name) &&
        !p.attachments.some((a) => /\.(gp[345x]?|gtp|musicxml|mxl|xml|mid|midi)$/i.test(a.name)))
    ) {
      if (p.scoreMidi) candidates.add(p.scoreMidi);
      p.scoreMidi = null;
      p.alignment = null;
      p.scoreAttachmentId = null;
    }
  } else {
    if (p.kind !== 'creation') throw new Error('分轨分组数据无效');
    if (itemId === 'source' && p.sessionSource) {
      const placeholder = 'media/' + crypto.randomUUID() + '.wav';
      const file = store.asset(id, placeholder);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, require('./takes.cjs').wavHeader(0, 48000), { flag: 'wx' });
      detachSource(p, placeholder);
      try {
        return store.save(p);
      } catch (error) {
        fs.rmSync(file, { force: true });
        throw error;
      }
    } else {
      const group = (p.sourceGroups || []).find((g) => g.id === itemId);
      if (!group) throw new Error('分轨分组数据无效');
      group.tracks.forEach((t) => candidates.add(t.file));
      p.sourceGroups = p.sourceGroups.filter((g) => g.id !== itemId);
    }
  }
  const remaining = new Set(referencedFiles(p));
  const paths = [...candidates]
    .filter(
      (file) => /^(attachments|groups)\//.test(file.replaceAll('\\', '/')) && !remaining.has(file),
    )
    .map((file) => store.asset(id, file));
  const saved = store.save(p);
  for (const file of paths) fs.rmSync(file, { force: true });
  return saved;
}
module.exports = { removeContent, detachSource, finishSourceRemoval };
