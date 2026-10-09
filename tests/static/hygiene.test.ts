import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(__dirname, '..', '..')

function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.name === 'node_modules' || d.name === 'dist') continue
    const p = join(dir, d.name)
    if (d.isDirectory()) walk(p, exts, out)
    else if (exts.test(d.name)) out.push(p)
  }
  return out
}

/** Strip comments and string-free noise cheaply enough for grep-style checks. */
function code(file: string): string {
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function offenders(files: string[], re: RegExp): string[] {
  return files.filter((f) => re.test(code(f))).map((f) => relative(root, f))
}

describe('source hygiene', () => {
  const src = walk(join(root, 'src'), /\.(ts|tsx)$/)
  const tests = walk(join(root, 'tests'), /\.(ts|tsx)$/).filter((f) => !f.endsWith('hygiene.test.ts'))

  it('finds source files', () => {
    expect(src.length).toBeGreaterThan(10)
  })

  it('has no console.log in src', () => {
    expect(offenders(src, /\bconsole\.(log|debug|trace)\s*\(/)).toEqual([])
  })

  it('has no debugger statements in src', () => {
    expect(offenders(src, /^\s*debugger\b/m)).toEqual([])
  })

  it('has no focused tests (.only) in tests/', () => {
    expect(offenders(tests, /\b(it|test|describe)\.only\s*\(/)).toEqual([])
  })
})
