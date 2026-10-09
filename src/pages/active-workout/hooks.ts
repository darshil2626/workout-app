import { useLiveQuery } from 'dexie-react-hooks'
import type { Exercise } from '../../db/types'
import { getPreviousPerformance, type PreviousPerformance } from '../../lib/history'
import { loadRecords, type ExerciseRecords } from '../../lib/records'

/** Look up "last time" performances for every exercise in the session. */
export function usePreviousPerformances(exerciseIds: string[], excludeWorkoutId?: string) {
  const key = exerciseIds.join('|')
  return useLiveQuery(
    async () => {
      const map = new Map<string, PreviousPerformance>()
      for (const id of key === '' ? [] : key.split('|')) {
        const prev = await getPreviousPerformance(id, excludeWorkoutId)
        if (prev) map.set(id, prev)
      }
      return map
    },
    [key, excludeWorkoutId],
    new Map<string, PreviousPerformance>(),
  )
}

/**
 * Best-ever values per exercise, excluding the session in progress, so a set
 * logged now can be compared against everything that came before it.
 */
export function useRecordBaselines(
  exerciseIds: string[],
  exerciseById: Map<string, Exercise>,
  libraryLoaded: boolean,
  bodyweightKg: number | null,
  countWarmups: boolean,
  excludeWorkoutId?: string,
) {
  const key = exerciseIds.join('|')
  // Keyed on the kinds actually being queried rather than the library's size:
  // a rename, a kind change or a merge leaves the count untouched, and keying
  // on size would then serve a baseline computed from a stale exercise map.
  const kindKey = exerciseIds.map((id) => exerciseById.get(id)?.kind ?? '?').join('|')
  const result = useLiveQuery(
    async () => {
      const map = new Map<string, ExerciseRecords>()
      for (const id of key === '' ? [] : key.split('|')) {
        const exercise = exerciseById.get(id)
        if (!exercise) continue
        map.set(id, await loadRecords(id, exercise.kind, bodyweightKg, countWarmups, excludeWorkoutId))
      }
      return { kindKey, map }
    },
    [key, kindKey, excludeWorkoutId, bodyweightKg, countWarmups],
    // Undefined until the first scan resolves, so "not loaded yet" stays
    // distinguishable from "loaded, and this exercise has no history".
    undefined,
  )
  // Not ready while the library is still loading (every exercise would look
  // unknown and the scan would resolve to an empty map), and not ready while the
  // result on hand was computed for different exercise kinds: useLiveQuery keeps
  // serving the previous result until the new scan finishes. Treating either as
  // loaded made a reload mid-workout re-announce PRs that were already set.
  return libraryLoaded && result?.kindKey === kindKey ? result.map : undefined
}
