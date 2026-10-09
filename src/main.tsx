import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { db, initDb } from './db/db'
import { applyTheme, resolveTheme } from './lib/theme'
import { dismissSplash } from './lib/splash'
import { maybeLoadQaDataset, maybeSeedSyntheticData } from './dev/seedSynthetic'
import { migrateLegacyDatabase, migrateLegacyStorage } from './db/legacyMigration'
import { StartupError } from './components/StartupError'
import { installGlobalErrorHandlers } from './lib/errorReporting'
import { QUOTA_EVENT, requestPersistentStorage } from './lib/storage'
import { unsupportedReasons } from './lib/support'
import { UnsupportedBrowser } from './components/UnsupportedBrowser'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// Before anything async, so a failure during startup is seen too. A full disk
// is announced to the shell (App.tsx), which owns the toast.
installGlobalErrorHandlers(() => window.dispatchEvent(new Event(QUOTA_EVENT)))

// Set when the database cannot be opened. Rendering the app over it would
// leave every screen reading from nothing, so the finally block below shows a
// recovery screen instead.
let startupError: unknown = null

function start() {
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
        startupError = err
      }),
    )
    .then(() => (startupError === null ? db.settings.get(1) : undefined))
    .then((settings) => {
      if (settings) applyTheme(resolveTheme(settings.theme))
    })
    .catch(() => {})
    .finally(() => {
      root.render(<StrictMode>{startupError === null ? <App /> : <StartupError error={startupError} />}</StrictMode>)
      dismissSplash()
      // After first paint, so the permission check never delays opening the app.
      if (startupError === null) void requestPersistentStorage()
    })
}

// Say so, rather than draw a broken screen, on a browser that lacks something the
// app is built on. Nothing has touched the database by this point.
const unsupported = unsupportedReasons()
if (unsupported.length > 0) {
  root.render(<UnsupportedBrowser reasons={unsupported} />)
  dismissSplash()
} else {
  start()
}
