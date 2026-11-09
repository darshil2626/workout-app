import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, DEFAULT_SETTINGS, initDb } from '../../src/db/db'
import { PLATE_PRESETS } from '../../src/lib/plates'
import { LB_PER_KG } from '../../src/lib/units'
import { resetDb } from './helpers'

function stubLocale(language: string, languages: string[] = [language]) {
  vi.stubGlobal('navigator', { language, languages })
}

beforeEach(resetDb)
afterEach(() => vi.unstubAllGlobals())

describe('starting units for a new install', () => {
  it('a US device starts in lb, mi and in, with a 45 lb bar and pound plates', async () => {
    stubLocale('en-US')
    await initDb()
    const pounds = PLATE_PRESETS.find((p) => p.label.startsWith('Pounds'))!
    expect(await db.settings.get(1)).toEqual({
      ...DEFAULT_SETTINGS,
      weightUnit: 'lb',
      distanceUnit: 'mi',
      lengthUnit: 'in',
      barWeightKg: 45 / LB_PER_KG,
      availablePlatesKg: pounds.platesKg,
    })
  })

  it('a UK device starts in kg, km and cm', async () => {
    stubLocale('en-GB')
    await initDb()
    expect(await db.settings.get(1)).toEqual(DEFAULT_SETTINGS)
  })

  it('the first preferred language wins over navigator.language', async () => {
    stubLocale('en-GB', ['en-US', 'en-GB'])
    await initDb()
    expect((await db.settings.get(1))?.weightUnit).toBe('lb')
  })

  it('an existing settings row is never rewritten, whatever the locale', async () => {
    stubLocale('en-GB')
    await initDb()
    await db.settings.update(1, { distanceUnit: 'mi' })
    const before = await db.settings.get(1)

    stubLocale('en-US')
    await initDb()
    expect(await db.settings.get(1)).toEqual(before)
  })

  it('a US user who chose kg keeps kg on every launch', async () => {
    stubLocale('en-US')
    await initDb()
    await db.settings.update(1, { weightUnit: 'kg', distanceUnit: 'km', lengthUnit: 'cm' })
    await initDb()
    const row = await db.settings.get(1)
    expect([row?.weightUnit, row?.distanceUnit, row?.lengthUnit]).toEqual(['kg', 'km', 'cm'])
  })
})
