// Gives Node an IndexedDB so Dexie can open. Each test file gets a fresh
// instance because Vitest isolates modules per file.
import 'fake-indexeddb/auto'
