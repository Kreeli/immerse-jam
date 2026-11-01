const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const safe = (key) => !['__proto__', 'constructor', 'prototype'].includes(key);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Keep a patch tied to the render that produced the edit. Unchanged analysis,
// recordings and track fields must never travel back with a mixer adjustment.
function difference(base, next) {
  const patch = {};
  for (const key of Object.keys(next)) {
    if (!safe(key) || next[key] === undefined || equal(base?.[key], next[key])) continue;
    const a = base?.[key],
      b = next[key];
    if (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length &&
      a.length === b.length &&
      a.every((item, i) => item?.id && item.id === b[i]?.id)
    ) {
      patch[key] = {
        $items: b.flatMap((item, i) => {
          const changes = difference(a[i], item);
          return Object.keys(changes).length
            ? [{ id: item.id, file: a[i].file, patch: changes }]
            : [];
        }),
      };
    } else patch[key] = object(a) && object(b) ? difference(a, b) : b;
  }
  return patch;
}

function merge(base, patch) {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (!safe(key)) throw new Error('Invalid project field');
    if (object(value) && Array.isArray(value.$items)) {
      if (!Array.isArray(base?.[key]))
        throw new Error('Project tracks have changed; reopen the project');
      const items = new Map(base[key].map((item) => [item.id, item]));
      for (const change of value.$items) {
        const item = items.get(change.id);
        if (!item || (change.file !== undefined && change.file !== item.file))
          throw new Error('Project tracks have changed; reopen the project');
        items.set(change.id, merge(item, change.patch));
      }
      result[key] = base[key].map((item) => items.get(item.id));
    } else result[key] = object(value) ? merge(object(base?.[key]) ? base[key] : {}, value) : value;
  }
  return result;
}
module.exports = { difference, merge };
