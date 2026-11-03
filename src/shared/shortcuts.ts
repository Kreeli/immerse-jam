export function playerShortcut(
  event: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'repeat'>,
) {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const key = event.key.toLowerCase(),
    code = event.code;
  if (code === 'ArrowLeft' || key === 'arrowleft') return 'back';
  if (code === 'ArrowRight' || key === 'arrowright') return 'forward';
  if (event.repeat) return null;
  if (code === 'Space' || key === ' ' || key === 'spacebar') return 'toggle';
  if (key === 'l' || code === 'KeyL') return 'loop';
  if (key === 'm' || code === 'KeyM') return 'marker';
  return null;
}
