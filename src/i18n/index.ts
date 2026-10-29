import english from '../../shared/locales/en.json';
import { getPreferences } from '../app/preferences';
const catalog: Record<string, string> = english;
const reverse = new Map(Object.entries(catalog).map(([key, value]) => [value, key]));
export function t(key: string, values: unknown[] = []) {
  const text = getPreferences().language === 'en' ? (catalog[key] ?? key) : key;
  return text.replace(/\{(\d+)\}/g, (_match, index) => String(values[Number(index)] ?? ''));
}
function compile(text: string) {
  const fields: number[] = [];
  const source = text
    .split(/(\{\d+\})/)
    .map((part) => {
      const match = part.match(/^\{(\d+)\}$/);
      if (match) {
        fields.push(Number(match[1]));
        return '([\\s\\S]*?)';
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
  return { regex: new RegExp('^' + source + '$'), fields };
}
const patterns = Object.keys(catalog)
  .filter((key) => /\{\d+\}/.test(key))
  .map((key) => ({ key, zh: compile(key), en: compile(catalog[key]) }));
export function message(input: string | undefined | null): string {
  if (!input) return '';
  const text = input.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
  const en = getPreferences().language === 'en';
  if (en && catalog[text]) return catalog[text];
  if (!en && reverse.has(text)) return reverse.get(text)!;
  for (const pattern of patterns) {
    const form = en ? pattern.zh : pattern.en,
      matched = text.match(form.regex);
    if (matched) {
      const values: unknown[] = [];
      form.fields.forEach((field, i) => {
        const value = matched[i + 1];
        values[field] =
          en && /^(BS |HT |SCNet |Mel-Band |Beat This!)/.test(value)
            ? catalog[value] || value
            : value;
      });
      return t(pattern.key, values);
    }
  }
  if (text.includes('\n')) return text.split('\n').map(message).join('\n');
  const entries = en ? Object.entries(catalog) : [...reverse];
  for (const [key, value] of entries)
    if (
      key.length >= 5 &&
      key.trim() === key &&
      !key.includes('{') &&
      text.startsWith(key) &&
      key !== text
    )
      return value + message(text.slice(key.length));
  return text;
}
