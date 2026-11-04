// Ordering is presentation metadata. It never rewrites audio, timings or groups.
export function orderedTracks<T extends { id: string }>(items: T[], ids: string[] = []): T[] {
  const ranks = new Map(ids.map((id, index) => [id, index]));
  return [...items].sort((a, b) => (ranks.get(a.id) ?? Infinity) - (ranks.get(b.id) ?? Infinity));
}

const cache = new Map<string, string[]>();
const listeners = new Set<() => void>();
export const orderKey = (projectId: string, scope: string) =>
  'immerse.track-order.' + projectId + ':' + scope;
export function readTrackOrder(key: string): string[] {
  if (!cache.has(key)) {
    let ids: string[] = [];
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '[]');
      if (Array.isArray(saved))
        ids = [...new Set(saved.filter((id) => typeof id === 'string' && id.length <= 200))].slice(
          0,
          1000,
        );
    } catch {}
    cache.set(key, ids);
  }
  return cache.get(key)!;
}
export function writeTrackOrder(key: string, ids: string[]) {
  const value = [...new Set(ids)];
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep the current session usable if browser storage is full. */
  }
  cache.set(key, value);
  listeners.forEach((listener) => listener());
}
export function subscribeTrackOrder(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
