import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initDb } from './db/db'
import './index.css'

const root = createRoot(document.getElementById('root')!)

// Seed the exercise library before the first render so pickers are never empty.
initDb()
  .catch((err: unknown) => {
    console.error('Database initialisation failed', err)
  })
  .finally(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
