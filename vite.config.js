import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the build also runs from a subfolder such as GitHub Pages
  base: './',
  build: { chunkSizeWarningLimit: 800 },
  server: { host: true },
});
