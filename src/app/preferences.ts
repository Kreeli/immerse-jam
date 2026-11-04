import { jamCall } from '../platform/project-call';
import { useSyncExternalStore } from 'react';
export type Preferences = {
  language: 'zh-CN' | 'en';
  theme: 'dark' | 'light' | 'system';
  accent: 'rose' | 'blue' | 'green' | 'purple';
  waveColor: string;
  pointerStyle: 'arrow' | 'ring' | 'crosshair' | 'system';
  libraryLayout: 'grid' | 'list';
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  defaultFolderName: string;
  defaultFolderCover: string;
};
const listeners = new Set<() => void>();
const defaults: Preferences = {
  language:
    typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
      ? 'zh-CN'
      : 'en',
  theme: 'dark',
  accent: 'rose',
  waveColor: '',
  pointerStyle: 'arrow',
  libraryLayout: 'grid',
  sidebarWidth: 236,
  sidebarCollapsed: false,
  defaultFolderName: '',
  defaultFolderCover: '',
};
let preferences: Preferences = defaults;
try {
  const saved = JSON.parse(localStorage.getItem('immerse.preferences') || '{}');
  preferences = {
    language: ['zh-CN', 'en'].includes(saved.language) ? saved.language : defaults.language,
    theme: ['dark', 'light', 'system'].includes(saved.theme) ? saved.theme : 'dark',
    accent: ['rose', 'blue', 'green', 'purple'].includes(saved.accent) ? saved.accent : 'rose',
    waveColor: /^#[0-9a-f]{6}$/i.test(saved.waveColor || '') ? saved.waveColor : '',
    pointerStyle: ['arrow', 'ring', 'crosshair', 'system'].includes(saved.pointerStyle)
      ? saved.pointerStyle
      : 'arrow',
    libraryLayout: saved.libraryLayout === 'list' ? 'list' : 'grid',
    sidebarWidth: Number.isFinite(saved.sidebarWidth)
      ? Math.min(360, Math.max(200, saved.sidebarWidth))
      : 236,
    sidebarCollapsed: saved.sidebarCollapsed === true,
    defaultFolderName:
      typeof saved.defaultFolderName === 'string' && saved.defaultFolderName.trim().length <= 60
        ? saved.defaultFolderName.trim()
        : '',
    defaultFolderCover:
      typeof saved.defaultFolderCover === 'string' &&
      saved.defaultFolderCover.length <= 180000 &&
      /^data:image\/(jpeg|png|webp);base64,/.test(saved.defaultFolderCover)
        ? saved.defaultFolderCover
        : '',
  };
} catch {}
if (typeof window !== 'undefined' && window.jam?.language)
  preferences = { ...preferences, language: window.jam.language };
const system =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: light)') : null;
function apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.sidebarCollapsed = String(preferences.sidebarCollapsed);
  document.documentElement.style.setProperty('--sidebar-width', preferences.sidebarWidth + 'px');
  document.documentElement.dataset.theme =
    preferences.theme === 'system' ? (system?.matches ? 'light' : 'dark') : preferences.theme;
  document.documentElement.dataset.accent = preferences.accent;
  document.documentElement.dataset.waveColor = preferences.waveColor;
  if (preferences.waveColor)
    document.documentElement.style.setProperty('--waveform-fill', preferences.waveColor);
  else document.documentElement.style.removeProperty('--waveform-fill');
  if (window.jam) void jamCall('ui-language', { language: preferences.language }).catch(() => {});
}
system?.addEventListener('change', apply);
apply();
export function getPreferences() {
  return preferences;
}
export function setPreferences(patch: Partial<Preferences>) {
  preferences = { ...preferences, ...patch };
  localStorage.setItem('immerse.preferences', JSON.stringify(preferences));
  apply();
  listeners.forEach((listener) => listener());
}
export function usePreferences() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getPreferences);
}
