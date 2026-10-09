import { defineConfig, devices } from '@playwright/test'

// E2E runs against the production build served by `vite preview`, because that
// is what ships (service worker included). Run `npm run build` first; the
// `test:e2e` script does it.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4199',
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --port 4199 --strictPort',
    url: 'http://localhost:4199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
