import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/db/db'
import { measurementWeightUnit } from '../../src/lib/measurements'
import { defaultUnitsForLocale, flippedUnits, IMPERIAL_UNITS, METRIC_UNITS } from '../../src/lib/units'

describe('defaultUnitsForLocale', () => {
  it.each([
    ['en-US', IMPERIAL_UNITS],
    ['en-LR', IMPERIAL_UNITS],
    ['my-MM', IMPERIAL_UNITS],
    ['es-US', IMPERIAL_UNITS],
    ['en_US', IMPERIAL_UNITS],
    ['en-GB', METRIC_UNITS],
    ['en', METRIC_UNITS],
    ['de-DE', METRIC_UNITS],
    ['en-CA', METRIC_UNITS],
    [undefined, METRIC_UNITS],
    ['', METRIC_UNITS],
    ['not a locale!!', METRIC_UNITS],
    ['US', METRIC_UNITS],
  ])('%s', (locale, expected) => {
    expect(defaultUnitsForLocale(locale)).toEqual(expected)
  })
})

describe('flippedUnits', () => {
  it('flips every unit when all three still match one system', () => {
    expect(flippedUnits(METRIC_UNITS)).toEqual(IMPERIAL_UNITS)
    expect(flippedUnits(IMPERIAL_UNITS)).toEqual(METRIC_UNITS)
  })

  it('flips only the weight when distance or length was chosen by hand', () => {
    expect(flippedUnits({ weightUnit: 'kg', distanceUnit: 'mi', lengthUnit: 'cm' })).toEqual({ weightUnit: 'lb' })
    expect(flippedUnits({ weightUnit: 'lb', distanceUnit: 'mi', lengthUnit: 'cm' })).toEqual({ weightUnit: 'kg' })
  })

  it('leaves the measurement unit alone, so an unset one keeps following the weight unit', () => {
    const after = { ...DEFAULT_SETTINGS, ...flippedUnits(DEFAULT_SETTINGS) }
    expect(after.measurementWeightUnit).toBeNull()
    expect(measurementWeightUnit(after)).toBe('lb')
    const chosen = { ...DEFAULT_SETTINGS, measurementWeightUnit: 'kg' as const }
    expect(measurementWeightUnit({ ...chosen, ...flippedUnits(chosen) })).toBe('kg')
  })
})
