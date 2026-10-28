const catalog = require('../shared/locales/en.json');
const { dialog } = require('electron');
function language() {
  return process.env.IMMERSE_UI_LANGUAGE || process.env.IMMERSE_LOCALE || 'zh-CN';
}
function text(value, values = []) {
  const translated = language() === 'en' ? catalog[value] || value : value;
  return translated.replace(/\{(\d+)\}/g, (_match, index) => String(values[Number(index)] ?? ''));
}
function options(value) {
  if (Array.isArray(value)) return value.map(options);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        ['title', 'name', 'message', 'buttonLabel'].includes(key) && typeof item === 'string'
          ? text(item)
          : options(item),
      ]),
    );
  return value;
}
const nativeDialogs = {
  showOpenDialog: (win, value) => dialog.showOpenDialog(win, options(value)),
  showSaveDialog: (win, value) => dialog.showSaveDialog(win, options(value)),
};
module.exports = { text, language, nativeDialogs };
