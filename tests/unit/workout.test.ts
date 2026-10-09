import { describe, expect, it } from 'vitest'
import {
  computeTotals, countsTowardVolume, describeSet, effectiveWeightKg, elapsedSeconds, emptySet,
  estimate1RM, fieldsFor, hasLoggedValue, isSetLogged, prWeightKg, setBadges, setFromTarget, setTypeBadge,
} from '../../src/lib/workout'
import type { ExerciseKind } from '../../src/db/types'
import { mkEx, mkLogged, mkSet, mkWorkout } from './helpers'

describe('estimate1RM (Epley)', () => {
  it('returns the weight itself for a single', () => expect(estimate1RM(100, 1)).toBe(100))
  it('applies w*(1+r/30)', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.6667, 3)
    expect(estimate1RM(60, 30)).toBeCloseTo(120, 6)
  })
  it('returns 0 for non-positive reps or weight', () => {
    expect(estimate1RM(100, 0)).toBe(0)
    expect(estimate1RM(100, -3)).toBe(0)
    expect(estimate1RM(0, 5)).toBe(0)
    expect(estimate1RM(-20, 5)).toBe(0)
  })
})

describe('effectiveWeightKg', () => {
  const s = (weight: number | null) => mkSet({ weight })
  it('uses the entered weight for external loads', () => {
    expect(effectiveWeightKg(s(80), 'weight_reps', 70)).toBe(80)
    expect(effectiveWeightKg(s(null), 'weight_reps', 70)).toBe(0)
    expect(effectiveWeightKg(s(20), 'duration_weight', 70)).toBe(20)
  })
  it('uses bodyweight for bodyweight / reps-only', () => {
    expect(effectiveWeightKg(s(null), 'bodyweight_reps', 70)).toBe(70)
    expect(effectiveWeightKg(s(null), 'reps_only', 70)).toBe(70)
    expect(effectiveWeightKg(s(null), 'bodyweight_reps', null)).toBe(0)
    expect(effectiveWeightKg(s(null), 'bodyweight_reps', undefined)).toBe(0)
  })
  it('adds load to bodyweight when weighted', () => {
    expect(effectiveWeightKg(s(20), 'weighted_bodyweight', 80)).toBe(100)
    expect(effectiveWeightKg(s(20), 'weighted_bodyweight', null)).toBe(20)
  })
  it('subtracts assistance, floored at zero', () => {
    expect(effectiveWeightKg(s(30), 'assisted_bodyweight', 80)).toBe(50)
    expect(effectiveWeightKg(s(100), 'assisted_bodyweight', 80)).toBe(0)
    expect(effectiveWeightKg(s(30), 'assisted_bodyweight', null)).toBe(0)
  })
  it('is 0 for time/distance kinds', () => {
    expect(effectiveWeightKg(s(50), 'duration', 80)).toBe(0)
    expect(effectiveWeightKg(s(50), 'distance_duration', 80)).toBe(0)
  })
})

describe('prWeightKg', () => {
  it('scores only added load for weighted bodyweight', () => {
    expect(prWeightKg(mkSet({ weight: 20 }), 'weighted_bodyweight')).toBe(20)
  })
  it('is 0 for assisted, bodyweight, reps-only and duration/distance', () => {
    for (const k of ['assisted_bodyweight', 'bodyweight_reps', 'reps_only', 'duration', 'distance_duration'] as ExerciseKind[]) {
      expect(prWeightKg(mkSet({ weight: 30 }), k)).toBe(0)
    }
  })
  it('handles null weight', () => expect(prWeightKg(mkSet({ weight: null }), 'weight_reps')).toBe(0))
})

describe('countsTowardVolume', () => {
  it('requires completion', () => expect(countsTowardVolume(mkSet({ completed: false }))).toBe(false))
  it('excludes warm-ups by default', () => {
    expect(countsTowardVolume(mkSet({ setType: 'warmup' }))).toBe(false)
    expect(countsTowardVolume(mkSet({ setType: 'warmup' }), true)).toBe(true)
  })
  it('counts drop and failure sets', () => {
    expect(countsTowardVolume(mkSet({ setType: 'drop' }))).toBe(true)
    expect(countsTowardVolume(mkSet({ setType: 'failure' }))).toBe(true)
  })
  it('incomplete warm-up never counts even with the setting', () => {
    expect(countsTowardVolume(mkSet({ setType: 'warmup', completed: false }), true)).toBe(false)
  })
})

describe('computeTotals', () => {
  const bench = mkEx('weight_reps')
  const pull = mkEx('weighted_bodyweight')
  const run = mkEx('distance_duration')
  const map = new Map([bench, pull, run].map((e) => [e.id, e]))

  it('sums volume, sets, reps, time, distance', () => {
    const t = computeTotals(
      [
        mkLogged(bench.id, [mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 80, reps: 10 })]),
        mkLogged(run.id, [mkSet({ durationSec: 600, distanceM: 2000 })]),
      ],
      map, 80,
    )
    expect(t).toEqual({ totalVolumeKg: 1300, totalSets: 3, totalReps: 15, totalDurationSec: 600, totalDistanceM: 2000 })
  })
  it('skips incomplete and warm-up sets by default, includes warm-ups when asked', () => {
    const ex = [mkLogged(bench.id, [
      mkSet({ weight: 40, reps: 10, setType: 'warmup' }),
      mkSet({ weight: 100, reps: 5, completed: false }),
      mkSet({ weight: 100, reps: 5 }),
    ])]
    expect(computeTotals(ex, map, null).totalVolumeKg).toBe(500)
    expect(computeTotals(ex, map, null).totalSets).toBe(1)
    expect(computeTotals(ex, map, null, true).totalVolumeKg).toBe(900)
    expect(computeTotals(ex, map, null, true).totalSets).toBe(2)
  })
  it('weighted bodyweight volume uses bodyweight + load; unknown bodyweight falls back to load', () => {
    const ex = [mkLogged(pull.id, [mkSet({ weight: 20, reps: 5 })])]
    expect(computeTotals(ex, map, 80).totalVolumeKg).toBe(500)
    expect(computeTotals(ex, map, null).totalVolumeKg).toBe(100)
  })
  it('a set with no reps adds no volume but still counts as a set', () => {
    const t = computeTotals([mkLogged(bench.id, [mkSet({ weight: 100, reps: null })])], map, 80)
    expect(t.totalVolumeKg).toBe(0)
    expect(t.totalSets).toBe(1)
  })
  it('unknown exercises default to weight_reps', () => {
    const t = computeTotals([mkLogged('missing', [mkSet({ weight: 10, reps: 10 })])], map, 80)
    expect(t.totalVolumeKg).toBe(100)
  })
  it('empty input is all zeros', () => {
    expect(computeTotals([], map, 80)).toEqual({ totalVolumeKg: 0, totalSets: 0, totalReps: 0, totalDurationSec: 0, totalDistanceM: 0 })
  })
})

describe('setBadges', () => {
  it('numbers only normal sets, letters the rest', () => {
    const sets = [
      mkSet({ setType: 'warmup' }), mkSet(), mkSet({ setType: 'drop' }), mkSet(), mkSet({ setType: 'failure' }),
    ]
    expect(setBadges(sets)).toEqual(['W', '1', 'D', '2', 'F'])
  })
  it('handles empty', () => expect(setBadges([])).toEqual([]))
  it('setTypeBadge passes the index for normal', () => expect(setTypeBadge('normal', 7)).toBe('7'))
})

describe('fieldsFor', () => {
  it('flags relative weight only for the bodyweight-relative kinds', () => {
    const all: ExerciseKind[] = ['weight_reps', 'bodyweight_reps', 'weighted_bodyweight', 'assisted_bodyweight', 'duration', 'duration_weight', 'distance_duration', 'reps_only']
    expect(all.filter((k) => fieldsFor(k).relativeWeight)).toEqual(['weighted_bodyweight', 'assisted_bodyweight'])
  })
  it('exposes the right columns', () => {
    expect(fieldsFor('distance_duration')).toMatchObject({ distance: true, duration: true, weight: false, reps: false })
    expect(fieldsFor('duration_weight')).toMatchObject({ weight: true, duration: true, reps: false })
  })
})

describe('set helpers', () => {
  it('emptySet is blank and incomplete', () => {
    const s = emptySet('warmup')
    expect(s).toMatchObject({ weight: null, reps: null, completed: false, setType: 'warmup' })
    expect(emptySet().id).not.toBe(emptySet().id)
  })
  it('setFromTarget copies targets but is not completed', () => {
    const s = setFromTarget({ weight: 50, reps: 8, durationSec: null, distanceM: null, setType: 'drop' })
    expect(s).toMatchObject({ weight: 50, reps: 8, setType: 'drop', completed: false, rpe: null })
  })
  it('isSetLogged vs hasLoggedValue differ on zero and completed', () => {
    expect(isSetLogged(mkSet({ completed: false, weight: 0 }))).toBe(true)
    expect(hasLoggedValue(mkSet({ completed: true, weight: 0, reps: 0 }))).toBe(false)
    expect(isSetLogged(mkSet({ completed: true }))).toBe(true)
    expect(isSetLogged(mkSet({ completed: false }))).toBe(false)
    expect(hasLoggedValue(mkSet({ reps: 3 }))).toBe(true)
    expect(hasLoggedValue(mkSet({ distanceM: 10 }))).toBe(true)
    expect(hasLoggedValue(mkSet({ durationSec: 10 }))).toBe(true)
  })
})

describe('elapsedSeconds', () => {
  it('uses finishedAt and subtracts paused time', () => {
    const w = mkWorkout({ startedAt: 0, finishedAt: 100_000, pausedSec: 30 })
    expect(elapsedSeconds(w, 999_999)).toBe(70)
  })
  it('uses now for active sessions', () => {
    expect(elapsedSeconds(mkWorkout({ startedAt: 1000, finishedAt: null }), 61_999)).toBe(60)
  })
  it('never goes negative', () => {
    expect(elapsedSeconds(mkWorkout({ startedAt: 0, finishedAt: 10_000, pausedSec: 99 }))).toBe(0)
  })
})

describe('describeSet', () => {
  const fmt = { weight: (k: number | null) => `${k}kg`, distance: (m: number | null) => `${m}m`, duration: (s: number) => `${s}s` }
  it('formats weight x reps', () => expect(describeSet(mkSet({ weight: 80, reps: 5 }), 'weight_reps', fmt)).toBe('80kg · 5 reps'))
  it('signs relative weights', () => {
    expect(describeSet(mkSet({ weight: 20, reps: 5 }), 'weighted_bodyweight', fmt)).toBe('+20kg · 5 reps')
    expect(describeSet(mkSet({ weight: 20, reps: 5 }), 'assisted_bodyweight', fmt)).toBe('−20kg · 5 reps')
  })
  it('distance first, then duration', () => {
    expect(describeSet(mkSet({ distanceM: 5000, durationSec: 1500 }), 'distance_duration', fmt)).toBe('5000m · 1500s')
  })
  it('returns "-" when empty', () => expect(describeSet(mkSet(), 'weight_reps', fmt)).toBe('-'))
})
