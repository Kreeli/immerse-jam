import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { assetsInlineLimit: 0, target: 'chrome140', chunkSizeWarningLimit: 1800 },
});
