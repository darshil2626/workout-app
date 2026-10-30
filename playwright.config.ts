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
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  // WebKit is Safari's engine, which is what every iPhone browser runs. It catches
  // engine bugs, not iOS behaviour: Home Screen install, storage eviction and audio
  // after screen lock still need a real phone (docs/AGENTS.md). It runs in CI (Linux)
  // and on request with E2E_WEBKIT=1; Playwright's Windows WebKit build never gets
  // past the splash here, with no error, so it is not part of a local `npm test`.
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    ...(process.env.CI || process.env.E2E_WEBKIT ? [{ name: 'webkit', use: { ...devices['iPhone 14'] } }] : []),
  ],
  webServer: {
    command: 'node node_modules/vite/bin/vite.js preview --port 4199 --strictPort',
    url: 'http://localhost:4199',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
