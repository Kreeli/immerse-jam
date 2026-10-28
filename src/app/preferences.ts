import { useSyncExternalStore } from 'react';
export type Preferences = {
  language: 'zh-CN' | 'en';
  theme: 'dark' | 'light' | 'system';
  accent: 'rose' | 'blue' | 'green' | 'purple';
};
const listeners = new Set<() => void>();
const defaults: Preferences = {
  language:
    typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('zh')
      ? 'zh-CN'
      : 'en',
  theme: 'dark',
  accent: 'rose',
};
let preferences: Preferences = defaults;
try {
  const saved = JSON.parse(localStorage.getItem('immerse.preferences') || '{}');
  preferences = {
    language: ['zh-CN', 'en'].includes(saved.language) ? saved.language : defaults.language,
    theme: ['dark', 'light', 'system'].includes(saved.theme) ? saved.theme : 'dark',
    accent: ['rose', 'blue', 'green', 'purple'].includes(saved.accent) ? saved.accent : 'rose',
  };
} catch {}
if (typeof window !== 'undefined' && window.jam?.language)
  preferences = { ...preferences, language: window.jam.language };
const system =
  typeof matchMedia !== 'undefined' ? matchMedia('(prefers-color-scheme: light)') : null;
function apply() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.theme =
    preferences.theme === 'system' ? (system?.matches ? 'light' : 'dark') : preferences.theme;
  document.documentElement.dataset.accent = preferences.accent;
  if (window.jam)
    void window.jam.call('ui-language', { language: preferences.language }).catch(() => {});
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
