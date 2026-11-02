import { defineConfig } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const desktop = path.resolve(process.env.IMMERSE_DEMO_APP_ROOT || repo);
export default defineConfig({
  root: here,
  base: './',
  publicDir: false,
  resolve: {
    alias: {
      '@desktop': path.join(desktop, 'src'),
      '@project-patch': path.join(desktop, 'shared/project-patch.cjs'),
    },
  },
  plugins: [
    {
      name: 'browser-demo-adapters',
      enforce: 'pre',
      resolveId(source) {
        if (/\/audio\/capture$/.test(source)) return path.join(here, 'capture.ts');
        if (/\/android\/NativeCapture$/.test(source)) return path.join(here, 'devices.ts');
        if (/app-icon\.png$/.test(source)) return path.join(repo, 'docs/site/assets/app-icon.ico');
      },
      transform(code, id) {
        if (id.replaceAll('\\', '/').endsWith('/shared/types.ts')) {
          const original = /export function asset\(id: string, file: string\) \{[\s\S]*?\n\}/;
          if (!original.test(code))
            throw new Error('Desktop asset helper changed: update the demo adapter');
          return code.replace(
            original,
            `export function asset(id: string, file: string) {
          if (file.startsWith('blob:')) return file;
          return new URL('../assets/audio/fabulous-rehearsal/' + file.split('/').pop(), location.href).href;
        }`,
          );
        }
      },
      closeBundle() {
        const fonts = path.join(repo, 'node_modules/@coderline/alphatab/dist/font');
        fs.cpSync(fonts, path.join(repo, 'docs/site/tryout/alphatab/font'), { recursive: true });
      },
    },
  ],
  build: {
    outDir: path.join(repo, 'docs/site/tryout'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: 'chrome120',
    chunkSizeWarningLimit: 2200,
  },
});
