export const isAndroid = !!window.ImmerseNative;
export const isDesktop = !isAndroid && /Electron\//.test(navigator.userAgent);
export const platformVersion = isAndroid ? '0.1.0-preview.5' : undefined;
