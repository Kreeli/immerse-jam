// Rasterize the repository's vector monogram for Windows and Android.
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    const svg = fs.readFileSync('assets/app-icon.svg', 'utf8');
    for (const size of [512, 256]) {
      const png = await page.evaluate(
        async ({ svg, size }) => {
          const image = new Image();
          image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          canvas.getContext('2d').drawImage(image, 0, 0, size, size);
          return canvas.toDataURL('image/png').split(',')[1];
        },
        { svg, size },
      );
      const bytes = Buffer.from(png, 'base64');
      if (size === 512) fs.writeFileSync('assets/app-icon.png', bytes);
      else {
        const header = Buffer.alloc(22);
        header.writeUInt16LE(1, 2);
        header.writeUInt16LE(1, 4);
        header.writeUInt16LE(1, 10);
        header.writeUInt16LE(32, 12);
        header.writeUInt32LE(bytes.length, 14);
        header.writeUInt32LE(22, 18);
        fs.writeFileSync('assets/app-icon.ico', Buffer.concat([header, bytes]));
      }
    }
    console.log('512px PNG and 256px ICO generated from assets/app-icon.svg');
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
