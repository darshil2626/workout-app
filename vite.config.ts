import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// `base` matters when hosting on GitHub Pages under /<repo>/.
// Set BASE_PATH=/your-repo-name/ at build time; defaults to root for local dev.
const base = process.env.BASE_PATH ?? '/'

// Windows drives mounted into WSL don't deliver inotify events, so hot reload
// silently stops working. Polling is the only thing that sees the edits there,
// and it is skipped elsewhere because it costs noticeably more CPU.
const onWindowsMount = process.cwd().startsWith('/mnt/')

// Stamped into the About card so it is possible to tell, on a phone, exactly
// which deploy is installed. Actions sets GITHUB_SHA; local builds say so.
const buildId = [
  new Date().toISOString().slice(0, 16).replace('T', ' '),
  process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local',
].join(' · ')

export default defineConfig({
  base,
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  server: onWindowsMount ? { watch: { usePolling: true, interval: 300 } } : undefined,
  plugins: [
    react(),
    VitePWA({
      // 'prompt' keeps the new worker waiting instead of reloading the page
      // out from under whoever is mid-set. UpdatePrompt offers the reload, and
      // a worker nobody accepts still activates once the app is fully closed.
      registerType: 'prompt',
      // Registration happens through the React hook in UpdatePrompt, so the
      // plugin must not also inject its own script tag.
      injectRegister: null,
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'IronLog — Gym Tracker',
        short_name: 'IronLog',
        description:
          'Offline-first strength log: routines, set-by-set logging, rest timer, personal records, muscle recovery and progress charts.',
        // Both must track --bg in src/index.css. They colour the splash screen
        // and the phone's status bar, which is the one place a stale value
        // shows as a flash of the wrong black before the app paints.
        theme_color: '#0f0d0b',
        background_color: '#0f0d0b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The exercise illustrations are ~7 MB across 480 files. Precaching
        // them would block the first load on downloading the lot, so they are
        // fetched and kept on first view instead.
        globIgnores: ['**/exercise-art/**'],
        runtimeCaching: [
          {
            // Stale-while-revalidate rather than cache-first: the drawings live
            // at stable paths, so cache-first would pin a redrawn frame to the
            // old art forever. This still paints from cache instantly and works
            // offline; it just picks up a redraw on the next view.
            urlPattern: /\/exercise-art\/.*\.svg$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'exercise-art',
              // No max age on purpose: an expired entry is evicted, which would
              // leave an exercise imageless offline.
              expiration: { maxEntries: 600 },
            },
          },
        ],
      },
    }),
  ],
})
