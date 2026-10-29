import { defineConfig } from 'vite';
export default defineConfig(({ mode }) => ({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: mode === 'android' ? 'dist-android' : 'dist',
    assetsInlineLimit: 0,
    target: mode === 'android' ? 'chrome120' : 'chrome140',
    chunkSizeWarningLimit: 1800,
  },
}));
