import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// Short commit hash for the build stamp shown in About. Cloudflare's CI
// exposes the SHA via env var; fall back to git locally, then to 'dev'.
function commitHash(): string {
  const env =
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.GITHUB_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __COMMIT__: JSON.stringify(commitHash()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Draw Overlay — trace any picture',
        short_name: 'Draw Overlay',
        description:
          'Prop your phone over paper, load a picture, trace it. Nothing leaves your device.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        // Deliberately NOT orientation-locked: paper is landscape as often as
        // it is portrait, and the overlay has its own rotation control anyway.
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // The whole app is the shell — there is no runtime-fetched data at all
        // (the user's picture never leaves the page), so precache everything
        // and the app works offline from the first load.
        globPatterns: ['**/*.{js,css,html,svg,png}']
      }
    })
  ],
  server: {
    host: true
  }
});
