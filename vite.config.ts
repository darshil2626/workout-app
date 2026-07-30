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

export default defineConfig({
  base,
  server: onWindowsMount ? { watch: { usePolling: true, interval: 300 } } : undefined,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'IronLog — Gym Tracker',
        short_name: 'IronLog',
        description: 'Offline-first workout logger: routines, sets, rest timer, history.',
        theme_color: '#0b0d12',
        background_color: '#0b0d12',
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
      },
    }),
  ],
})
