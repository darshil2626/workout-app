import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/db/db'
import { measurementWeightUnit } from '../../src/lib/measurements'
import { gearForUnit, PLATE_PRESETS } from '../../src/lib/plates'
import {
  defaultUnitsForLocale,
  flippedUnits,
  formatWeight,
  IMPERIAL_UNITS,
  LB_PER_KG,
  METRIC_UNITS,
  reinterpretWeight,
} from '../../src/lib/units'

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

describe('reinterpretWeight', () => {
  it('keeps the typed number and changes only what it means', () => {
    expect(reinterpretWeight(60, 'kg', 'lb')).toBe(27.216)
    expect(formatWeight(reinterpretWeight(60, 'kg', 'lb'), 'lb')).toBe('60')
    // 135 typed in lb is stored as 61.235 kg by SetRow; read as kg it is 135.
    expect(reinterpretWeight(61.235, 'lb', 'kg')).toBe(135)
    expect(reinterpretWeight(22.5, 'kg', 'kg')).toBe(22.5)
  })
})

describe('gearForUnit', () => {
  const pounds = PLATE_PRESETS.find((p) => p.label.startsWith('Pounds'))!.platesKg

  it('swaps the metric bar and plates for pound ones, and back', () => {
    const lb = gearForUnit(DEFAULT_SETTINGS, 'lb')
    expect(lb).toEqual({ barWeightKg: 45 / LB_PER_KG, availablePlatesKg: pounds })
    expect(gearForUnit({ barWeightKg: lb.barWeightKg!, availablePlatesKg: pounds }, 'kg')).toEqual({
      barWeightKg: 20,
      availablePlatesKg: DEFAULT_SETTINGS.availablePlatesKg,
    })
  })

  it('keeps a bar or plate list that was edited by hand', () => {
    expect(gearForUnit({ barWeightKg: 15, availablePlatesKg: [20, 10, 5] }, 'lb')).toEqual({})
    expect(gearForUnit({ barWeightKg: 20, availablePlatesKg: [20, 10, 5] }, 'lb')).toEqual({
      barWeightKg: 45 / LB_PER_KG,
    })
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
