import { defineConfig } from 'vitest/config'

// Unit and integration tests run in Node. IndexedDB comes from fake-indexeddb
// (loaded by tests/setup.ts), so Dexie works without a browser.
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify('test') },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/static/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    testTimeout: 20000,
  },
})
