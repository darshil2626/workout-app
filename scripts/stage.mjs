// Builds a "staging" copy of the app and serves it on the local network, so a
// change (above all a schema change) can be tried on a real phone against a
// restored copy of real data without touching the installed app.
//
// It is a different origin from the live site, so browser storage is separate:
// nothing done here can reach the real install. It is served over plain http,
// which browsers treat as insecure, so there is no service worker and it cannot
// be installed. That is enough to exercise IndexedDB upgrades and every screen.
import { spawnSync, spawn } from 'node:child_process'
import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 4174
const OUT = join(root, 'dist-staging')

const env = {
  ...process.env,
  BUILD_CHANNEL: 'staging',
  // Never report from a staging build, whatever is in the environment.
  VITE_POSTHOG_KEY: '',
}

console.log('Building staging copy...')
const build = spawnSync(
  process.execPath,
  [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT, '--emptyOutDir'],
  { cwd: root, env, stdio: 'inherit' },
)
if (build.status !== 0) process.exit(build.status ?? 1)

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address)

console.log('\nOpen this on your phone (same Wi-Fi):')
for (const a of addresses) console.log(`  http://${a}:${PORT}/`)
console.log('\nThen Settings > Import backup with a recent export. Ctrl+C to stop.\n')

const preview = spawn(
  process.execPath,
  [
    join(root, 'node_modules/vite/bin/vite.js'),
    'preview',
    '--outDir',
    OUT,
    '--host',
    '--port',
    String(PORT),
    '--strictPort',
  ],
  { cwd: root, env, stdio: 'inherit' },
)
preview.on('exit', (code) => process.exit(code ?? 0))
