import { inlineScriptHashes } from '../../scripts/csp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(__dirname, '..', '..')
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const tmpRoot = mkdtempSync(join(tmpdir(), 'trana-test-dist-'))

function build(base: string, name: string): string {
  const out = join(tmpRoot, name)
  execFileSync(process.execPath, [viteBin, 'build', '--outDir', out, '--emptyOutDir'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production', BASE_PATH: base, VITE_POSTHOG_KEY: '' },
    stdio: 'pipe',
  })
  return out
}

function walk(dir: string, out: string[] = []): string[] {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name)
    if (d.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

/** Dark --bg from src/styles/base.css (the first --bg declaration is :root's dark theme). */
function darkBg(): string {
  const css = readFileSync(join(root, 'src', 'styles', 'base.css'), 'utf8')
  const m = css.match(/--bg:\s*(#[0-9a-fA-F]{3,8})\s*;/)
  if (!m) throw new Error('no --bg in base.css')
  return m[1].toLowerCase()
}

const BASES = [
  { base: '/trana/', name: 'sub' },
  { base: '/', name: 'root' },
]
const dirs: Record<string, string> = {}

beforeAll(() => {
  for (const { base, name } of BASES) dirs[name] = build(base, name)
}, 240_000)

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe.each(BASES)('production build with base $base', ({ base, name }) => {
  const dir = () => dirs[name]

  it('emits a valid manifest consistent with the base', () => {
    const m = JSON.parse(readFileSync(join(dir(), 'manifest.webmanifest'), 'utf8'))
    expect(m.name).toBeTruthy()
    expect(m.short_name).toBeTruthy()
    expect(m.start_url).toBe(base)
    expect(m.scope).toBe(base)
    expect(m.start_url.startsWith(m.scope)).toBe(true)
    expect(m.display).toBe('standalone')
    expect(m.theme_color.toLowerCase()).toBe(darkBg())

    const sizes = m.icons.map((i: { sizes: string }) => i.sizes)
    expect(sizes).toContain('192x192')
    expect(sizes).toContain('512x512')
    for (const icon of m.icons) {
      expect(existsSync(join(dir(), icon.src)), `icon ${icon.src}`).toBe(true)
    }
  })

  it('generates a service worker that precaches index.html', () => {
    const sw = join(dir(), 'sw.js')
    expect(existsSync(sw)).toBe(true)
    const text = readFileSync(sw, 'utf8')
    expect(text).toMatch(/url:\s*["']index\.html["']/)
  })

  it('index.html asset URLs use the base path and point at real files', () => {
    const html = readFileSync(join(dir(), 'index.html'), 'utf8')
    const urls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/^(https?:|data:|#)/.test(u))
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(u.startsWith(base), `${u} should start with ${base}`).toBe(true)
      const file = join(dir(), u.slice(base.length))
      expect(existsSync(file), `${u} exists`).toBe(true)
    }
    expect(html).toMatch(/rel="manifest"/)
  })

  it('ships a Content-Security-Policy that covers every inline script by hash', () => {
    const html = readFileSync(join(dir(), 'index.html'), 'utf8')
    const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)
    expect(meta, 'CSP meta tag in dist/index.html').not.toBeNull()
    const scriptSrc = meta![1].split('; ').find((d) => d.startsWith('script-src ')) ?? ''
    expect(scriptSrc).not.toContain('unsafe-inline')
    const hashes = inlineScriptHashes(html)
    expect(hashes.length).toBeGreaterThan(0)
    for (const h of hashes) expect(scriptSrc).toContain(h)
  })

  it('leaves dev-only seed hooks out of the production bundle', () => {
    const js = walk(join(dir(), 'assets')).filter((f) => f.endsWith('.js'))
    expect(js.length).toBeGreaterThan(0)
    const hits: string[] = []
    for (const f of js) {
      const text = readFileSync(f, 'utf8')
      for (const needle of ['devSyntheticSeeded', 'synthetic-dataset', 'qa-dataset', 'maybeLoadQaDataset']) {
        if (text.includes(needle)) hits.push(`${needle} in ${f.slice(dir().length)}`)
      }
    }
    expect(hits).toEqual([])
  })
})
