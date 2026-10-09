import { describe, expect, it } from 'vitest'
import {
  LB_PER_KG, METRES_PER_MILE, cmToDisplay, displayToCm, displayToKg, displayToMetres, formatDistance,
  formatLength, formatVolume, formatVolumeCompact, formatWeight, kgToDisplay, metresToDisplay, parseNumber, trimNumber,
} from '../../src/lib/units'

describe('weight conversion', () => {
  it('kg is identity', () => {
    expect(kgToDisplay(82.5, 'kg')).toBe(82.5)
    expect(displayToKg(82.5, 'kg')).toBe(82.5)
  })
  it('lb conversion uses 2.20462', () => {
    expect(kgToDisplay(100, 'lb')).toBeCloseTo(220.462, 2)
    expect(displayToKg(225, 'lb')).toBeCloseTo(102.058, 2)
    expect(LB_PER_KG).toBeCloseTo(2.20462, 4)
  })
  it('round trips', () => {
    for (const kg of [0, 0.5, 20, 61.234, 142.5, 500]) {
      expect(displayToKg(kgToDisplay(kg, 'lb'), 'lb')).toBeCloseTo(kg, 9)
    }
  })
  it('plate-friendly lb values round to clean numbers when displayed', () => {
    expect(formatWeight(displayToKg(135, 'lb'), 'lb')).toBe('135')
    expect(formatWeight(displayToKg(2.5, 'lb'), 'lb')).toBe('2.5')
  })
})

describe('formatWeight / trimNumber', () => {
  it('trims trailing zeros', () => {
    expect(formatWeight(2.5, 'kg')).toBe('2.5')
    expect(formatWeight(100, 'kg')).toBe('100')
    expect(formatWeight(100.25, 'kg')).toBe('100.25')
    expect(formatWeight(100.256, 'kg')).toBe('100.26')
  })
  it('null/undefined are empty strings, zero is "0"', () => {
    expect(formatWeight(null, 'kg')).toBe('')
    expect(formatWeight(undefined, 'lb')).toBe('')
    expect(formatWeight(0, 'kg')).toBe('0')
  })
  it('lb output', () => expect(formatWeight(100, 'lb')).toBe('220.46'))
  it('trimNumber handles non-finite and decimals', () => {
    expect(trimNumber(NaN)).toBe('')
    expect(trimNumber(Infinity)).toBe('')
    expect(trimNumber(1.005, 1)).toBe('1')
    expect(trimNumber(3.14159, 3)).toBe('3.142')
  })
})

describe('formatVolume', () => {
  it('rounds and uses separators', () => {
    expect(formatVolume(1234.6, 'kg')).toBe((1235).toLocaleString())
    expect(formatVolume(1000, 'lb')).toBe((2205).toLocaleString())
  })
})

describe('formatVolumeCompact boundaries', () => {
  const k = (v: number) => formatVolumeCompact(v, 'kg')
  it('keeps small figures exact', () => {
    expect(k(0)).toBe('0')
    expect(k(9_999)).toBe((9_999).toLocaleString())
    expect(k(9_999.4)).toBe((9_999).toLocaleString())
  })
  it('abbreviates from 10k with one decimal', () => {
    expect(k(10_000)).toBe('10k')
    expect(k(10_049)).toBe('10k')
    expect(k(12_340)).toBe('12.3k')
    expect(k(99_499)).toBe('99.5k')
  })
  it('rounds to whole k from ~100k', () => {
    expect(k(99_500)).toBe('100k')
    expect(k(100_000)).toBe('100k')
    expect(k(125_000)).toBe('125k')
    expect(k(125_499)).toBe('125k')
    expect(k(999_499)).toBe('999k')
  })
  it('never yields "1000k"', () => {
    expect(k(999_500)).toBe('1M')
    expect(k(999_999)).toBe('1M')
  })
  it('millions use up to two decimals', () => {
    expect(k(1_000_000)).toBe('1M')
    expect(k(1_230_000)).toBe('1.23M')
    expect(k(1_234_567)).toBe('1.23M')
    expect(k(12_500_000)).toBe('12.5M')
  })
  it('converts to lb before bucketing', () => {
    // 5,000 kg = 11,023 lb -> past the 10k boundary
    expect(formatVolumeCompact(5_000, 'lb')).toBe('11k')
    expect(formatVolumeCompact(4_500, 'lb')).toBe((9_921).toLocaleString())
  })
  it('handles negatives symmetrically on the bucket', () => {
    expect(k(-125_000)).toBe('-125k')
  })
})

describe('distance', () => {
  it('km and miles', () => {
    expect(metresToDisplay(5000, 'km')).toBe(5)
    expect(metresToDisplay(METRES_PER_MILE, 'mi')).toBeCloseTo(1, 10)
    expect(displayToMetres(5, 'km')).toBe(5000)
    expect(displayToMetres(1, 'mi')).toBeCloseTo(1609.344, 6)
  })
  it('round trips', () => {
    for (const m of [0, 1, 400, 5000, 42195]) {
      expect(displayToMetres(metresToDisplay(m, 'mi'), 'mi')).toBeCloseTo(m, 8)
      expect(displayToMetres(metresToDisplay(m, 'km'), 'km')).toBeCloseTo(m, 8)
    }
  })
  it('formatDistance', () => {
    expect(formatDistance(5000, 'km')).toBe('5')
    expect(formatDistance(1500, 'km')).toBe('1.5')
    expect(formatDistance(5000, 'mi')).toBe('3.11')
    expect(formatDistance(null, 'km')).toBe('')
    expect(formatDistance(undefined, 'mi')).toBe('')
    expect(formatDistance(0, 'km')).toBe('0')
  })
})

describe('length', () => {
  it('cm / in', () => {
    expect(cmToDisplay(180, 'cm')).toBe(180)
    expect(cmToDisplay(2.54, 'in')).toBeCloseTo(1, 10)
    expect(displayToCm(10, 'in')).toBeCloseTo(25.4, 10)
    expect(displayToCm(10, 'cm')).toBe(10)
  })
  it('round trips', () => {
    for (const cm of [0, 33.3, 100, 182.88]) expect(displayToCm(cmToDisplay(cm, 'in'), 'in')).toBeCloseTo(cm, 9)
  })
  it('formatLength uses one decimal', () => {
    expect(formatLength(182.88, 'in')).toBe('72')
    expect(formatLength(100.04, 'cm')).toBe('100')
    expect(formatLength(100.26, 'cm')).toBe('100.3')
    expect(formatLength(null, 'cm')).toBe('')
  })
})

describe('parseNumber', () => {
  it('parses plain and decimal numbers', () => {
    expect(parseNumber('80')).toBe(80)
    expect(parseNumber('82.5')).toBe(82.5)
    expect(parseNumber('.5')).toBe(0.5)
    expect(parseNumber('0')).toBe(0)
  })
  it('accepts a comma decimal separator', () => expect(parseNumber('82,5')).toBe(82.5))
  it('strips stray characters and units', () => {
    expect(parseNumber('82.5kg')).toBe(82.5)
    expect(parseNumber(' 12 ')).toBe(12)
  })
  it('returns null for unusable input', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
    expect(parseNumber('.')).toBeNull()
    expect(parseNumber(',')).toBeNull()
  })
  it('drops a minus sign (negatives are not supported)', () => expect(parseNumber('-5')).toBe(5))
  it('returns null when multiple dots make NaN', () => expect(parseNumber('1.2.3')).toBeNull())
})
