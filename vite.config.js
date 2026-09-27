import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// The version shown in the menu: the number from package.json plus the date and id of the commit the
// game was built from (left out when there is no git, e.g. in a downloaded copy)
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try { commit = execSync('git log -1 --format="%cs %h"', { encoding: 'utf8' }).trim(); } catch (e) { /* no git */ }

export default defineConfig({
  // Relative asset paths, so the build also runs from a subfolder such as GitHub Pages
  base: './',
  build: { chunkSizeWarningLimit: 800 },
  server: { host: true, port: 5188 },
  define: {
    'import.meta.env.APP_VERSION': JSON.stringify(version),
    'import.meta.env.APP_COMMIT': JSON.stringify(commit),
  },
});
