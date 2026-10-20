import { defineConfig, devices } from '@playwright/test'

// Post-deploy checks against the live site (see tests/smoke/live.spec.ts). No local
// server: SMOKE_URL says where to look. Retries are generous because a CDN can serve
// the previous deploy for a minute or two.
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 90_000,
  retries: 2,
  reporter: [['list']],
  use: {
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
})
