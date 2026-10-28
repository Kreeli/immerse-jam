export function themeColor(color: string) {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--tone-' + color.slice(1).toLowerCase())
      .trim() || color
  );
}
