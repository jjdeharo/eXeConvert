import { defineConfig } from 'vite';

export default defineConfig({
  root: 'app',
  base: './',
  server: {
    port: 3007,
  },
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  },
});
