import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { db, initDb } from './db/db'
import { applyTheme, resolveTheme } from './lib/theme'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// Best-effort guess from the OS alone, before Dexie has even opened — removes
// the flash of the wrong theme during the `initDb` wait below. `Shell` in
// App.tsx re-applies (and keeps live) the real stored choice once settings load.
applyTheme(resolveTheme('system'))

// Seed the exercise library before the first render so pickers are never empty.
initDb()
  .catch((err: unknown) => {
    console.error('Database initialisation failed', err)
  })
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
