export const isAndroid = new URLSearchParams(location.search).get('platform') === 'android';
export const isDesktop = false;
export const platformVersion = isAndroid ? '0.1.0-preview.4' : undefined;
if (isAndroid) document.documentElement.dataset.platform = 'android';
