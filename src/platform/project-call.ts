let prepare: (() => Promise<void>) | undefined;
const ordered = new Set([
  'result-select',
  'result-rename',
  'take-start',
  'take-select',
  'take-delete',
  'take-import',
  'creation-add-group',
  'creation-import-group',
  'attach',
  'session-create',
  'project-delete',
  'export',
  'export-audio',
  'pair-start',
  'peer-prepare',
  'android-share-projects',
  'android-lan-upload',
]);

export function prepareProjectActions(callback: () => Promise<void>) {
  prepare = callback;
  return () => {
    if (prepare === callback) prepare = undefined;
  };
}

// Electron exposes an immutable bridge. Coordinate writes here without ever
// modifying that bridge; Android uses the same ordering for snapshots and edits.
export function jamCall<T = any>(method: string, data?: any): Promise<T> {
  return ordered.has(method) && prepare
    ? prepare().then(() => window.jam.call<T>(method, data))
    : window.jam.call<T>(method, data);
}
