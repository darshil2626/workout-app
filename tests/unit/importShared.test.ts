import { describe, expect, it } from 'vitest'
import {
  ExerciseResolver,
  buildSetValues,
  detectDistanceUnitFromHeader,
  detectWeightUnitFromHeader,
  findHeaderKey,
  isSecondsHeader,
  normalizeSetType,
  parseClockDuration,
  parseFloatOrNull,
  setTypeFromStrongOrder,
} from '../../src/lib/importers/shared'
import { mkEx } from './helpers'

describe('normalizeSetType', () => {
  it.each([
    ['warmup', 'warmup'],
    ['Warm Up', 'warmup'],
    ['WARM-UP', 'warmup'],
    ['drop', 'drop'],
    ['dropset', 'drop'],
    ['failure', 'failure'],
    ['To Failure', 'failure'],
    ['normal', 'normal'],
    ['', 'normal'],
    ['  ', 'normal'],
    ['weird', 'normal'],
  ])('%j -> %s', (raw, expected) => expect(normalizeSetType(raw)).toBe(expected))
  it('undefined -> normal', () => expect(normalizeSetType(undefined)).toBe('normal'))
})

describe('setTypeFromStrongOrder', () => {
  it('single-letter codes', () => {
    expect(setTypeFromStrongOrder('F')).toBe('failure')
    expect(setTypeFromStrongOrder(' f ')).toBe('failure')
    expect(setTypeFromStrongOrder('W')).toBe('warmup')
    expect(setTypeFromStrongOrder('wu')).toBe('warmup')
    expect(setTypeFromStrongOrder('D')).toBe('drop')
  })
  it('numbers are normal sets, words fall through', () => {
    expect(setTypeFromStrongOrder('1')).toBe('normal')
    expect(setTypeFromStrongOrder('12')).toBe('normal')
    expect(setTypeFromStrongOrder('Warm up')).toBe('warmup')
    expect(setTypeFromStrongOrder('Failure')).toBe('failure')
  })
})

describe('findHeaderKey', () => {
  const headers = ['date', 'weight (kg)', 'reps', 'distance(m)', 'weighted reps']
  it('exact match', () => expect(findHeaderKey(headers, ['reps'])).toBe('reps'))
  it('matches a unit suffix, with or without a space', () => {
    expect(findHeaderKey(headers, ['weight'])).toBe('weight (kg)')
    expect(findHeaderKey(headers, ['distance'])).toBe('distance(m)')
  })
  it('does not match a longer word that merely starts with the candidate', () => {
    expect(findHeaderKey(['weighted reps'], ['weight'])).toBeNull()
  })
  it('tries candidates, returns null when none', () => {
    expect(findHeaderKey(headers, ['nope', 'date'])).toBe('date')
    expect(findHeaderKey(headers, ['nope'])).toBeNull()
    expect(findHeaderKey([], ['date'])).toBeNull()
  })
})

describe('header unit detection', () => {
  it('weight', () => {
    expect(detectWeightUnitFromHeader('weight (kg)')).toBe('kg')
    expect(detectWeightUnitFromHeader('weight (kgs)')).toBe('kg')
    expect(detectWeightUnitFromHeader('weight (lb)')).toBe('lb')
    expect(detectWeightUnitFromHeader('weight (lbs)')).toBe('lb')
    expect(detectWeightUnitFromHeader('weight')).toBeNull()
    expect(detectWeightUnitFromHeader(null)).toBeNull()
  })
  it('distance', () => {
    expect(detectDistanceUnitFromHeader('distance (meters)')).toBe('m')
    expect(detectDistanceUnitFromHeader('distance (metres)')).toBe('m')
    expect(detectDistanceUnitFromHeader('distance (m)')).toBe('m')
    expect(detectDistanceUnitFromHeader('distance (km)')).toBe('km')
    expect(detectDistanceUnitFromHeader('distance (kilometers)')).toBe('km')
    expect(detectDistanceUnitFromHeader('distance (miles)')).toBe('mi')
    expect(detectDistanceUnitFromHeader('distance (mi)')).toBe('mi')
    expect(detectDistanceUnitFromHeader('distance')).toBeNull()
    expect(detectDistanceUnitFromHeader(null)).toBeNull()
  })
  it('seconds header', () => {
    expect(isSecondsHeader('duration (sec)')).toBe(true)
    expect(isSecondsHeader('duration (seconds)')).toBe(true)
    expect(isSecondsHeader('duration (s)')).toBe(false)
    expect(isSecondsHeader('duration')).toBe(false)
    expect(isSecondsHeader(null)).toBe(false)
  })
})

describe('parseFloatOrNull', () => {
  it('parses numbers and trims', () => {
    expect(parseFloatOrNull('12.5')).toBe(12.5)
    expect(parseFloatOrNull(' 7 ')).toBe(7)
    expect(parseFloatOrNull('0')).toBe(0)
    expect(parseFloatOrNull('-3')).toBe(-3)
  })
  it('reads a decimal comma, as exported by phones set to a European locale', () => {
    expect(parseFloatOrNull('1,5')).toBe(1.5)
  })
  it('null for blank, undefined, garbage, non-finite', () => {
    expect(parseFloatOrNull(undefined)).toBeNull()
    expect(parseFloatOrNull('')).toBeNull()
    expect(parseFloatOrNull('   ')).toBeNull()
    expect(parseFloatOrNull('abc')).toBeNull()
    expect(parseFloatOrNull('Infinity')).toBeNull()
    expect(parseFloatOrNull('1,5,5')).toBeNull() // ambiguous, so skipped rather than guessed
  })
})

describe('buildSetValues', () => {
  const raw = { weightKg: 50, reps: 8, durationSec: 30, distanceM: 400 }
  it('keeps only the fields the kind uses', () => {
    expect(buildSetValues('weight_reps', raw)).toEqual({ weight: 50, reps: 8, durationSec: null, distanceM: null })
    expect(buildSetValues('bodyweight_reps', raw)).toEqual({
      weight: null,
      reps: 8,
      durationSec: null,
      distanceM: null,
    })
    expect(buildSetValues('duration', raw)).toEqual({ weight: null, reps: null, durationSec: 30, distanceM: null })
    expect(buildSetValues('duration_weight', raw)).toEqual({ weight: 50, reps: null, durationSec: 30, distanceM: null })
    expect(buildSetValues('distance_duration', raw)).toEqual({
      weight: null,
      reps: null,
      durationSec: 30,
      distanceM: 400,
    })
    expect(buildSetValues('weighted_bodyweight', raw)).toEqual({
      weight: 50,
      reps: 8,
      durationSec: null,
      distanceM: null,
    })
  })
  it('zero durations and distances become null, zero weight/reps are kept', () => {
    expect(buildSetValues('distance_duration', { weightKg: null, reps: null, durationSec: 0, distanceM: 0 })).toEqual({
      weight: null,
      reps: null,
      durationSec: null,
      distanceM: null,
    })
    expect(buildSetValues('weight_reps', { weightKg: 0, reps: 0, durationSec: null, distanceM: null })).toEqual({
      weight: 0,
      reps: 0,
      durationSec: null,
      distanceM: null,
    })
  })
  it('nulls stay null', () => {
    expect(buildSetValues('weight_reps', { weightKg: null, reps: null, durationSec: null, distanceM: null })).toEqual({
      weight: null,
      reps: null,
      durationSec: null,
      distanceM: null,
    })
  })
})

describe('parseClockDuration', () => {
  it.each([
    ['2h 38m', 9480],
    ['45m', 2700],
    ['1h', 3600],
    ['90s', 90],
    ['1h 2m 3s', 3723],
    ['1H 30M', 5400],
    ['1.5h', 5400],
    ['', 0],
    ['soon', 0],
    ['12', 0],
  ])('%j -> %d', (text, secs) => expect(parseClockDuration(text)).toBe(secs))
})

describe('ExerciseResolver', () => {
  const squat = mkEx('weight_reps', {
    id: 'sq',
    name: 'Squat (Barbell)',
    muscleGroup: 'Quadriceps',
    equipment: 'Barbell',
  })
  const shape = { hasWeight: true, hasReps: true, hasDuration: false, hasDistance: false }

  it('reuses a matching library exercise without creating anything', () => {
    const r = new ExerciseResolver([squat])
    expect(r.resolve('squat (barbell)', shape)).toBe(squat)
    expect(r.created).toEqual([])
  })
  it('creates a classified custom exercise once, then reuses it', () => {
    const r = new ExerciseResolver([squat])
    const a = r.resolve('  Hack Squat (Machine) ', shape)
    expect(a).toMatchObject({
      name: 'Hack Squat (Machine)',
      isCustom: true,
      muscleGroup: 'Quadriceps',
      equipment: 'Machine',
      kind: 'weight_reps',
    })
    const b = r.resolve('hack squat (machine)', shape)
    expect(b).toBe(a)
    expect(r.created).toHaveLength(1)
  })
  it('new exercises get unique ids', () => {
    const r = new ExerciseResolver([])
    const a = r.resolve('Foo One', shape)
    const b = r.resolve('Bar Two', shape)
    expect(a.id).not.toBe(b.id)
  })
})
