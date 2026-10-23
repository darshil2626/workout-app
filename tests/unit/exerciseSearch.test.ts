import { describe, expect, it } from 'vitest'
import { SEED_EXERCISES } from '../../src/db/seed'
import { exerciseRank, matchesExercise } from '../../src/lib/exerciseSearch'

const find = (q: string) => SEED_EXERCISES.filter((e) => matchesExercise(e.name, q)).map((e) => e.name)

describe('exercise search', () => {
  it('expands gym abbreviations', () => {
    expect(find('rdl')).toContain('Romanian Deadlift (Barbell)')
    expect(find('ohp')).toContain('Overhead Press (Barbell)')
    expect(find('db ohp')).toContain('Overhead Press (Dumbbell)')
    expect(find('db ohp')).not.toContain('Overhead Press (Barbell)')
    expect(find('bb bench')).toContain('Bench Press (Barbell)')
  })
  it('matches word prefixes and any word order', () => {
    expect(find('bench pr')).toContain('Bench Press (Barbell)')
    expect(find('press bench')).toContain('Bench Press (Barbell)')
  })
  it('forgives a one-letter slip on longer words', () => {
    expect(find('benhc')).toContain('Bench Press (Barbell)')
    expect(find('deadlfit')).toContain('Romanian Deadlift (Barbell)')
  })
  it('still rejects nonsense and short non-matches', () => {
    expect(find('zzzz')).toEqual([])
    expect(find('xq')).toEqual([])
  })
  it('an empty query matches everything and ranks names starting with it first', () => {
    expect(matchesExercise('Anything', '')).toBe(true)
    expect(exerciseRank('Bench Press (Barbell)', 'bench')).toBeLessThan(exerciseRank('Incline Bench Press', 'bench'))
  })
})
