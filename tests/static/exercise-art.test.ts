import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SEED_EXERCISES, slugify } from '../../src/db/seed'
import { EXERCISE_ART } from '../../src/db/exerciseArt'

const root = join(__dirname, '..', '..')
const artDir = join(root, 'public', 'exercise-art')

describe('seed exercises', () => {
  it('has unique ids and names', () => {
    const ids = SEED_EXERCISES.map((e) => e.id)
    const names = SEED_EXERCISES.map((e) => e.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('has no duplicate rows silently dropped by seed.ts build()', () => {
    // build() skips rows whose slug was already seen, which would hide a typo.
    const src = readFileSync(join(root, 'src', 'db', 'seed.ts'), 'utf8')
    const rows = [...src.matchAll(/^\s*\[(?:'((?:[^'\\]|\\.)+)'|"([^"]+)"),\s*'[A-Za-z ]+',\s*'/gm)].map((m) =>
      slugify((m[1] ?? m[2]).replace(/\\'/g, "'")),
    )
    expect(rows.length).toBeGreaterThan(100)
    expect(rows.length).toBe(SEED_EXERCISES.length)
    expect(new Set(rows).size).toBe(rows.length)
  })
})

describe('exercise art', () => {
  const seedIds = new Set(SEED_EXERCISES.map((e) => e.id))

  it('maps only to existing seed exercises', () => {
    const unknown = Object.keys(EXERCISE_ART).filter((id) => !seedIds.has(id))
    expect(unknown).toEqual([])
  })

  it('has frame-1/2/3.svg for every referenced slug', () => {
    const missing: string[] = []
    for (const slug of new Set(Object.values(EXERCISE_ART))) {
      for (const n of [1, 2, 3]) {
        const f = join(artDir, slug, `frame-${n}.svg`)
        if (!existsSync(f) || statSync(f).size === 0) missing.push(`${slug}/frame-${n}.svg`)
      }
    }
    expect(missing).toEqual([])
  })

  it('has no orphaned art folders (every folder is referenced by some exercise)', () => {
    const referenced = new Set(Object.values(EXERCISE_ART))
    const orphans = readdirSync(artDir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !referenced.has(d.name))
      .map((d) => d.name)
    expect(orphans).toEqual([])
  })

  it('has only frame-N.svg files in each folder', () => {
    const odd: string[] = []
    for (const d of readdirSync(artDir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue
      for (const f of readdirSync(join(artDir, d.name))) {
        if (!/^frame-[123]\.svg$/.test(f)) odd.push(`${d.name}/${f}`)
      }
    }
    expect(odd).toEqual([])
  })
})
