import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { db, initDb } from './db/db'
import { applyTheme, resolveTheme } from './lib/theme'
import { dismissSplash } from './lib/splash'
import { maybeLoadQaDataset, maybeSeedSyntheticData } from './dev/seedSynthetic'
import { migrateLegacyDatabase, migrateLegacyStorage } from './db/legacyMigration'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// Carries an install's data across from the app's previous name. Storage keys
// first and synchronously, so nothing reads one before it has been moved.
migrateLegacyStorage()

// Best-effort guess from the OS alone, before Dexie has even opened — removes
// the flash of the wrong theme during the `initDb` wait below. `Shell` in
// App.tsx re-applies (and keeps live) the real stored choice once settings load.
applyTheme(resolveTheme('system'))

// Dev-only synthetic data must load first: it fully repopulates every table
// (including exercises/settings) on a genuinely empty database, and initDb's
// own one-shot starter-routine seed below checks routines/workouts counts —
// running initDb first would seed that routine, make those counts non-zero,
// and permanently block the synthetic dataset from ever loading afterward.
// The database copy must precede everything below: each of them writes into a
// database that is empty until it has run, and a seeded one would be merged over.
migrateLegacyDatabase(db)
  .catch((err: unknown) => {
    // Non-fatal on purpose: the old data is untouched and the next launch retries.
    console.error('Legacy data migration failed', err)
  })
  .then(() => maybeLoadQaDataset())
  .then(() => maybeSeedSyntheticData())
  .catch((err: unknown) => {
    console.error('Synthetic dev data seed failed', err)
  })
  .then(() =>
    initDb().catch((err: unknown) => {
      console.error('Database initialisation failed', err)
    }),
  )
  .then(() => db.settings.get(1))
  .then((settings) => {
    if (settings) applyTheme(resolveTheme(settings.theme))
  })
  .catch(() => {})
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    dismissSplash()
  })
