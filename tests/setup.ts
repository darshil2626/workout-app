// Gives Node an IndexedDB so Dexie can open. Each test file gets a fresh
// instance because Vitest isolates modules per file.
import 'fake-indexeddb/auto'

// A new database takes its starting units from the device locale, and Node
// reports the machine's (en-US on CI runners). Pin a metric locale so every
// test sees the same defaults; tests that need another one stub `navigator`.
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'language', { value: 'en-GB', configurable: true })
  Object.defineProperty(navigator, 'languages', { value: ['en-GB'], configurable: true })
}
