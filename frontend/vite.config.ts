import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  base: '/assets/linkary-app/',
  build: {
    outDir: '../assets/linkary-app',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
  },
});
