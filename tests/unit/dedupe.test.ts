import { describe, expect, it } from 'vitest'
import { hasHistoryIssues, workoutFingerprint } from '../../src/lib/dedupe'
import { mkLogged, mkSet, mkWorkout } from './helpers'

const T = 1_700_000_000_000
const wk = (exercises = [mkLogged('bench', [mkSet({ weight: 100, reps: 5 })])], o = {}) =>
  mkWorkout({ startedAt: T, exercises, ...o })

describe('workoutFingerprint', () => {
  it('is stable for the same session', () => {
    const w = wk()
    expect(workoutFingerprint(w)).toBe(workoutFingerprint(w))
  })
  it('ignores ids, name, notes, finish time, rpe, set type, completed flag', () => {
    const a = wk([mkLogged('bench', [mkSet({ weight: 100, reps: 5, rpe: 8, setType: 'normal' })])], {
      name: 'A',
      notes: 'x',
      finishedAt: T + 1,
    })
    const b = wk(
      [mkLogged('bench', [mkSet({ weight: 100, reps: 5, rpe: null, setType: 'warmup', completed: false })])],
      { name: 'B', finishedAt: T + 99999 },
    )
    expect(workoutFingerprint(a)).toBe(workoutFingerprint(b))
  })
  it('differs when the start time differs', () => {
    expect(workoutFingerprint(wk())).not.toBe(workoutFingerprint(wk(undefined, { startedAt: T + 1 })))
  })
  it('differs when weight, reps, duration or distance differ', () => {
    const base = workoutFingerprint(wk())
    for (const s of [
      { weight: 101, reps: 5 },
      { weight: 100, reps: 6 },
      { weight: 100, reps: 5, durationSec: 30 },
      { weight: 100, reps: 5, distanceM: 10 },
    ]) {
      expect(workoutFingerprint(wk([mkLogged('bench', [mkSet(s)])]))).not.toBe(base)
    }
  })
  it('differs when the exercise differs', () => {
    expect(workoutFingerprint(wk([mkLogged('squat', [mkSet({ weight: 100, reps: 5 })])]))).not.toBe(
      workoutFingerprint(wk()),
    )
  })
  it('set order matters', () => {
    const a = wk([mkLogged('bench', [mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 80, reps: 8 })])])
    const b = wk([mkLogged('bench', [mkSet({ weight: 80, reps: 8 }), mkSet({ weight: 100, reps: 5 })])])
    expect(workoutFingerprint(a)).not.toBe(workoutFingerprint(b))
  })
  it('exercise order does not matter', () => {
    const e1 = mkLogged('bench', [mkSet({ weight: 100, reps: 5 })])
    const e2 = mkLogged('squat', [mkSet({ weight: 140, reps: 3 })])
    expect(workoutFingerprint(wk([e1, e2]))).toBe(workoutFingerprint(wk([e2, e1])))
  })
  it('placeholder (all-zero / empty) sets and exercises are ignored', () => {
    const clean = wk()
    const dirty = wk([
      mkLogged('bench', [mkSet({ weight: 100, reps: 5 }), mkSet({ weight: 0, reps: 0 }), mkSet()]),
      mkLogged('ghost', [mkSet({ weight: 0, reps: 0 })]),
      mkLogged('ghost2', []),
    ])
    expect(workoutFingerprint(dirty)).toBe(workoutFingerprint(clean))
  })
  it('rounds to 3 decimals so lb->kg float noise still matches', () => {
    const a = wk([mkLogged('bench', [mkSet({ weight: 102.0582, reps: 5 })])])
    const b = wk([mkLogged('bench', [mkSet({ weight: 102.05824, reps: 5 })])])
    expect(workoutFingerprint(a)).toBe(workoutFingerprint(b))
    const c = wk([mkLogged('bench', [mkSet({ weight: 102.07, reps: 5 })])])
    expect(workoutFingerprint(c)).not.toBe(workoutFingerprint(a))
  })
  it('a workout with nothing logged still fingerprints (by start time only)', () => {
    expect(workoutFingerprint(wk([]))).toBe(`${T}|`)
  })
  it('null and zero are different values only through hasLoggedValue filtering', () => {
    // weight null vs weight 0 on a set that has reps: different signatures
    const a = wk([mkLogged('bench', [mkSet({ weight: null, reps: 5 })])])
    const b = wk([mkLogged('bench', [mkSet({ weight: 0, reps: 5 })])])
    expect(workoutFingerprint(a)).not.toBe(workoutFingerprint(b))
  })
})

describe('hasHistoryIssues', () => {
  it('true if any counter is positive', () => {
    expect(hasHistoryIssues({ placeholderSets: 0, emptyWorkouts: 0, duplicates: 0 })).toBe(false)
    expect(hasHistoryIssues({ placeholderSets: 1, emptyWorkouts: 0, duplicates: 0 })).toBe(true)
    expect(hasHistoryIssues({ placeholderSets: 0, emptyWorkouts: 1, duplicates: 0 })).toBe(true)
    expect(hasHistoryIssues({ placeholderSets: 0, emptyWorkouts: 0, duplicates: 1 })).toBe(true)
  })
})
