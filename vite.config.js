import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';

// Shown in the menu: when the commit the game was built from was made, and its id, so a parent can tell
// whether the tablet already has the latest game (left out when there is no git, e.g. in a downloaded copy)
let commit = '';
try { commit = execSync('git log -1 --format="%cI %h"', { encoding: 'utf8' }).trim(); } catch (e) { /* no git */ }

export default defineConfig({
  // Relative asset paths, so the build also runs from a subfolder such as GitHub Pages
  base: './',
  build: { chunkSizeWarningLimit: 800 },
  server: { host: true, port: 5188 },
  define: { 'import.meta.env.APP_COMMIT': JSON.stringify(commit) },
});
