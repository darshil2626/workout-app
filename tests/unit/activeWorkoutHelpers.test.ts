import { describe, expect, it } from 'vitest'
import { startsRestOnCompletion, toLocalInput } from '../../src/pages/active-workout/helpers'
import { mkLogged } from './helpers'
import type { LoggedExercise } from '../../src/db/types'

function ex(id: string, supersetGroup: number | null): LoggedExercise {
  return { ...mkLogged(id, []), id: `le-${id}`, supersetGroup }
}

describe('startsRestOnCompletion', () => {
  it('a standalone exercise always rests', () => {
    const list = [ex('a', null), ex('b', null)]
    expect(startsRestOnCompletion(list[0], list)).toBe(true)
    expect(startsRestOnCompletion(list[1], list)).toBe(true)
  })

  it('a superset rests once per round, after its last member', () => {
    const list = [ex('a', 1), ex('b', 1), ex('c', 1), ex('d', null)]
    expect(list.map((le) => startsRestOnCompletion(le, list))).toEqual([false, false, true, true])
  })

  it('two supersets are judged independently', () => {
    const list = [ex('a', 1), ex('b', 1), ex('c', 2), ex('d', 2)]
    expect(list.map((le) => startsRestOnCompletion(le, list))).toEqual([false, true, false, true])
  })
})

describe('toLocalInput', () => {
  it('formats local wall-clock time for a datetime-local input', () => {
    const d = new Date(2026, 0, 5, 7, 9)
    expect(toLocalInput(d.getTime())).toBe('2026-01-05T07:09')
  })
})
