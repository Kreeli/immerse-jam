const fs = require('node:fs');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

function archiveFingerprint(manifest, checksums) {
  return crypto.createHash('sha256').update(manifest).update('\0').update(checksums).digest('hex');
}

function retainedDocument(store, id, name) {
  const file = store.asset(id, name);
  if (!fs.existsSync(file) || fs.statSync(file).size > 16 * 1024 ** 2) return null;
  return fs.readFileSync(file);
}

function legacyFingerprint(store, project) {
  if (!project.importRevision || project.importFingerprint) return null;
  const raw = retainedDocument(store, project.id, 'project.previous.json');
  if (!raw) return null;
  const original = JSON.parse(raw);
  if (
    original.id === project.id ||
    original.updatedAt !== project.importRevision ||
    (original.originId || original.id) !== project.originId ||
    original.kind !== project.kind
  )
    return null;
  const sums = retainedDocument(store, project.id, 'checksums.json');
  return sums && archiveFingerprint(raw, sums);
}

function matchesLegacyImport(store, local, source, hashes, fingerprint) {
  if (local.importFingerprint || !local.importRevision || local.importRevision !== source.updatedAt)
    return false;
  try {
    const exact = legacyFingerprint(store, local);
    if (exact) return exact === fingerprint;
    const sums = retainedDocument(store, local.id, 'checksums.json');
    if (!sums || !isDeepStrictEqual(JSON.parse(sums), hashes)) return false;
    // Old edits may have rotated the source manifest out of the recovery slot.
    // A matching revision and media list alone cannot distinguish lite from full.
    const fields = ['analysis', 'alignment', 'activeChordChartId', 'scoreMidi'];
    const lists = ['attachments', 'bookmarks', 'takes', 'selectedTakeIds', 'chordCharts'];
    return (
      fields.every((key) => isDeepStrictEqual(local[key] ?? null, source[key] ?? null)) &&
      lists.every((key) => isDeepStrictEqual(local[key] ?? [], source[key] ?? []))
    );
  } catch {
    return false;
  }
}

module.exports = { archiveFingerprint, legacyFingerprint, matchesLegacyImport };
