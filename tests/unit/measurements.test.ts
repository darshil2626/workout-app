import { describe, expect, it } from 'vitest'
import {
  MEASUREMENT_SPECS, formatMeasurement, fromDisplayValue, measurementLengthUnit, measurementWeightUnit,
  specFor, toDisplayValue, unitLabel,
} from '../../src/lib/measurements'
import type { MeasurementKind, MeasurementType, Settings } from '../../src/db/types'

const settings = (o: Partial<Settings> = {}) =>
  ({ weightUnit: 'kg', lengthUnit: 'cm', measurementWeightUnit: null, ...o }) as Settings

describe('specs', () => {
  it('has one unique spec per measurement type', () => {
    const types = MEASUREMENT_SPECS.map((s) => s.type)
    expect(new Set(types).size).toBe(types.length)
    expect(types).toHaveLength(15)
  })
  it('kinds', () => {
    expect(specFor('bodyweight').kind).toBe('weight')
    expect(specFor('bodyFat').kind).toBe('percent')
    for (const t of ['neck', 'waist', 'leftBicep', 'rightCalf'] as MeasurementType[]) expect(specFor(t).kind).toBe('length')
  })
  it('every spec has a label and resolves to itself', () => {
    for (const s of MEASUREMENT_SPECS) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(specFor(s.type)).toBe(s)
    }
  })
})

describe('units for measurements', () => {
  it('bodyweight unit follows the lifting unit unless overridden', () => {
    expect(measurementWeightUnit(settings({ weightUnit: 'lb' }))).toBe('lb')
    expect(measurementWeightUnit(settings({ weightUnit: 'kg', measurementWeightUnit: 'lb' }))).toBe('lb')
    expect(measurementWeightUnit(settings({ weightUnit: 'lb', measurementWeightUnit: 'kg' }))).toBe('kg')
  })
  it('length unit', () => expect(measurementLengthUnit(settings({ lengthUnit: 'in' }))).toBe('in'))
  it('unit labels', () => {
    expect(unitLabel('weight', settings({ measurementWeightUnit: 'lb' }))).toBe('lb')
    expect(unitLabel('percent', settings())).toBe('%')
    expect(unitLabel('length', settings({ lengthUnit: 'in' }))).toBe('in')
  })
})

describe('display conversion', () => {
  it('weight uses the measurement weight unit', () => {
    expect(toDisplayValue(80, 'weight', settings())).toBe(80)
    expect(toDisplayValue(80, 'weight', settings({ measurementWeightUnit: 'lb' }))).toBeCloseTo(176.37, 2)
    expect(fromDisplayValue(176.37, 'weight', settings({ weightUnit: 'lb' }))).toBeCloseTo(80, 2)
  })
  it('percent is passed through', () => {
    expect(toDisplayValue(15.5, 'percent', settings({ weightUnit: 'lb', lengthUnit: 'in' }))).toBe(15.5)
    expect(fromDisplayValue(15.5, 'percent', settings({ weightUnit: 'lb', lengthUnit: 'in' }))).toBe(15.5)
  })
  it('length converts cm <-> in', () => {
    expect(toDisplayValue(254, 'length', settings({ lengthUnit: 'in' }))).toBeCloseTo(100, 9)
    expect(fromDisplayValue(10, 'length', settings({ lengthUnit: 'in' }))).toBeCloseTo(25.4, 9)
    expect(toDisplayValue(90, 'length', settings())).toBe(90)
  })
  it('round trips for every kind and unit combination', () => {
    const kinds: MeasurementKind[] = ['weight', 'percent', 'length']
    for (const s of [settings(), settings({ weightUnit: 'lb', lengthUnit: 'in' }), settings({ measurementWeightUnit: 'lb' })]) {
      for (const k of kinds) {
        for (const v of [0, 12.3, 80, 182.88]) expect(fromDisplayValue(toDisplayValue(v, k, s), k, s)).toBeCloseTo(v, 9)
      }
    }
  })
})

describe('formatMeasurement', () => {
  it('weight to 2 decimals, others to 1, trimming zeros', () => {
    expect(formatMeasurement(80, 'weight', settings())).toBe('80')
    expect(formatMeasurement(80.456, 'weight', settings())).toBe('80.46')
    expect(formatMeasurement(80, 'weight', settings({ measurementWeightUnit: 'lb' }))).toBe('176.37')
    expect(formatMeasurement(15.54, 'percent', settings())).toBe('15.5')
    expect(formatMeasurement(100.04, 'length', settings())).toBe('100')
    expect(formatMeasurement(91.44, 'length', settings({ lengthUnit: 'in' }))).toBe('36')
  })
  it('zero is "0"', () => expect(formatMeasurement(0, 'length', settings())).toBe('0'))
})
