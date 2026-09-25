import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { db, initDb } from './db/db'
import { applyTheme, resolveTheme } from './lib/theme'
import { maybeSeedSyntheticData } from './dev/seedSynthetic'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// Best-effort guess from the OS alone, before Dexie has even opened — removes
// the flash of the wrong theme during the `initDb` wait below. `Shell` in
// App.tsx re-applies (and keeps live) the real stored choice once settings load.
applyTheme(resolveTheme('system'))

// Dev-only synthetic data must load first: it fully repopulates every table
// (including exercises/settings) on a genuinely empty database, and initDb's
// own one-shot starter-routine seed below checks routines/workouts counts —
// running initDb first would seed that routine, make those counts non-zero,
// and permanently block the synthetic dataset from ever loading afterward.
maybeSeedSyntheticData()
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
  })
