import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  base: '/app/',
  build: {
    outDir: '../app',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
