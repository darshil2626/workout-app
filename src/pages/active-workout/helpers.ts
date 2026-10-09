import type { LoggedExercise } from '../../db/types'

/**
 * A standalone exercise always starts rest on completion. One that's part of
 * a superset only starts it when it's the LAST member of the group in the
 * session's running order — Strong/Hevy-style supersets rest once per round,
 * after the whole group, not after each exercise in it. Group members are
 * built (and expected to stay) contiguous — see "Superset with exercise
 * above" below — so the last one in array order is the last one in the round.
 */
export function startsRestOnCompletion(le: LoggedExercise, exercises: LoggedExercise[]): boolean {
  if (le.supersetGroup === null) return true
  for (let i = exercises.length - 1; i >= 0; i--) {
    if (exercises[i].supersetGroup === le.supersetGroup) return exercises[i].id === le.id
  }
  return true
}

/** RPE in half steps from "could do 4 more" up to a genuine limit set. */
export const RPE_VALUES = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]

/** `datetime-local` wants local wall-clock time without a zone suffix. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
