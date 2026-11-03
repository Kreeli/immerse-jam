export function themeColor(color: string) {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue('--tone-' + color.slice(1).toLowerCase())
      .trim() || color
  );
}

export function trackColor(name: string) {
  const role = ['vocals', 'drums', 'bass', 'piano', 'guitar'].includes(name) ? name : 'other';
  return `var(--stem-${role})`;
}
