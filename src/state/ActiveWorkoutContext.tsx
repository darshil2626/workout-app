import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { db, newId } from '../db/db'
import type { LoggedExercise, LoggedSet, Routine, Workout } from '../db/types'
import { computeTotals, emptySet, isSetLogged, setFromTarget } from '../lib/workout'

/** How the session felt overall; both halves are optional, and skipping is fine. */
export interface SessionRating {
  effort?: number
  feeling?: number
}

interface ActiveWorkoutValue {
  workout: Workout | null
  /** True until the initial hydration from IndexedDB completes. */
  loading: boolean
  startEmpty: (name?: string) => Promise<string>
  startFromRoutine: (routine: Routine) => Promise<string>
  addExercises: (exerciseIds: string[]) => void
  removeExercise: (loggedExerciseId: string) => void
  /** Swaps which exercise a block logs, keeping the sets already recorded. */
  replaceExercise: (loggedExerciseId: string, exerciseId: string) => void
  moveExercise: (loggedExerciseId: string, direction: -1 | 1) => void
  /** Rewrites the whole running order; ids not listed keep their position. */
  reorderExercises: (orderedIds: string[]) => void
  addSet: (loggedExerciseId: string) => void
  removeSet: (loggedExerciseId: string, setId: string) => void
  updateSet: (loggedExerciseId: string, setId: string, patch: Partial<LoggedSet>) => void
  updateExercise: (loggedExerciseId: string, patch: Partial<Omit<LoggedExercise, 'sets' | 'id'>>) => void
  setName: (name: string) => void
  setNotes: (notes: string) => void
  /** Persists totals, marks the session done, and returns its id. */
  finish: (rating?: SessionRating) => Promise<string | null>
  discard: () => Promise<void>
}

const ActiveWorkoutContext = createContext<ActiveWorkoutValue | null>(null)

const PERSIST_DEBOUNCE_MS = 400

function defaultWorkoutName(now = new Date()): string {
  const hour = now.getHours()
  const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night'
  return `${part} Workout`
}

export function ActiveWorkoutProvider({ children }: { children: ReactNode }) {
  const [workout, setWorkout] = useState<Workout | null>(null)
  const [loading, setLoading] = useState(true)
  // Skips the debounced write triggered by hydration itself.
  const dirtyRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const active = await db.workouts.where('status').equals('active').toArray()
      if (cancelled) return
      // Only one session can be active; if several exist (e.g. after an
      // interrupted finish), keep the newest and close the strays.
      const sorted = active.sort((a, b) => b.startedAt - a.startedAt)
      if (sorted.length > 1) {
        await db.workouts.bulkDelete(sorted.slice(1).map((w) => w.id))
      }
      setWorkout(sorted[0] ?? null)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Debounced autosave: typing stays responsive, but a crash or a closed tab
  // loses at most PERSIST_DEBOUNCE_MS of input.
  useEffect(() => {
    if (!workout || !dirtyRef.current) return
    const snapshot = workout
    const id = window.setTimeout(() => {
      void db.workouts.put(snapshot)
    }, PERSIST_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [workout])

  // Flush pending edits when the app is backgrounded or closed.
  useEffect(() => {
    const flush = () => {
      if (workout && dirtyRef.current) void db.workouts.put(workout)
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [workout])

  const mutate = useCallback((fn: (w: Workout) => Workout) => {
    dirtyRef.current = true
    setWorkout((prev) => (prev ? fn(prev) : prev))
  }, [])

  const mutateExercise = useCallback(
    (loggedExerciseId: string, fn: (le: LoggedExercise) => LoggedExercise) => {
      mutate((w) => ({
        ...w,
        exercises: w.exercises.map((le) => (le.id === loggedExerciseId ? fn(le) : le)),
      }))
    },
    [mutate],
  )

  const startEmpty = useCallback(async (name?: string) => {
    const w: Workout = {
      id: newId(),
      name: name?.trim() || defaultWorkoutName(),
      status: 'active',
      startedAt: Date.now(),
      finishedAt: null,
      pausedSec: 0,
      exercises: [],
      exerciseIds: [],
      totalVolumeKg: 0,
      totalSets: 0,
      totalReps: 0,
    }
    await db.workouts.put(w)
    dirtyRef.current = false
    setWorkout(w)
    return w.id
  }, [])

  const startFromRoutine = useCallback(async (routine: Routine) => {
    const exercises: LoggedExercise[] = routine.exercises.map((re) => ({
      id: newId(),
      exerciseId: re.exerciseId,
      notes: re.notes,
      restSeconds: re.restSeconds ?? null,
      supersetGroup: re.supersetGroup,
      sets: re.sets.length > 0 ? re.sets.map(setFromTarget) : [emptySet()],
    }))
    const w: Workout = {
      id: newId(),
      name: routine.name,
      status: 'active',
      startedAt: Date.now(),
      finishedAt: null,
      pausedSec: 0,
      routineId: routine.id,
      exercises,
      exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))],
      totalVolumeKg: 0,
      totalSets: 0,
      totalReps: 0,
    }
    await db.workouts.put(w)
    dirtyRef.current = false
    setWorkout(w)
    return w.id
  }, [])

  const addExercises = useCallback(
    (exerciseIds: string[]) => {
      if (exerciseIds.length === 0) return
      mutate((w) => {
        const added: LoggedExercise[] = exerciseIds.map((exerciseId) => ({
          id: newId(),
          exerciseId,
          restSeconds: null,
          supersetGroup: null,
          sets: [emptySet()],
        }))
        const exercises = [...w.exercises, ...added]
        return { ...w, exercises, exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))] }
      })
    },
    [mutate],
  )

  const removeExercise = useCallback(
    (loggedExerciseId: string) => {
      mutate((w) => {
        const exercises = w.exercises.filter((le) => le.id !== loggedExerciseId)
        return { ...w, exercises, exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))] }
      })
    },
    [mutate],
  )

  /**
   * Keeps the block's id and its sets, so swapping a machine mid-session does
   * not throw away what has already been logged under it.
   */
  const replaceExercise = useCallback(
    (loggedExerciseId: string, exerciseId: string) => {
      mutate((w) => {
        const exercises = w.exercises.map((le) =>
          le.id === loggedExerciseId ? { ...le, exerciseId } : le,
        )
        return { ...w, exercises, exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))] }
      })
    },
    [mutate],
  )

  const reorderExercises = useCallback(
    (orderedIds: string[]) => {
      mutate((w) => {
        const byId = new Map(w.exercises.map((le) => [le.id, le]))
        const exercises: LoggedExercise[] = []
        for (const id of orderedIds) {
          const le = byId.get(id)
          if (le) {
            exercises.push(le)
            byId.delete(id)
          }
        }
        // Anything the caller did not mention keeps its relative order at the
        // end, so a stale id list can never drop an exercise from the session.
        for (const le of w.exercises) if (byId.has(le.id)) exercises.push(le)
        return { ...w, exercises }
      })
    },
    [mutate],
  )

  const moveExercise = useCallback(
    (loggedExerciseId: string, direction: -1 | 1) => {
      mutate((w) => {
        const i = w.exercises.findIndex((le) => le.id === loggedExerciseId)
        const j = i + direction
        if (i < 0 || j < 0 || j >= w.exercises.length) return w
        const exercises = [...w.exercises]
        ;[exercises[i], exercises[j]] = [exercises[j], exercises[i]]
        return { ...w, exercises }
      })
    },
    [mutate],
  )

  const addSet = useCallback(
    (loggedExerciseId: string) => {
      mutateExercise(loggedExerciseId, (le) => {
        // Carry the previous set's load forward: the common case is repeating it.
        const last = [...le.sets].reverse().find((s) => s.setType !== 'warmup') ?? le.sets.at(-1)
        const next = emptySet()
        if (last) {
          next.weight = last.weight
          next.reps = last.reps
          next.durationSec = last.durationSec
          next.distanceM = last.distanceM
        }
        return { ...le, sets: [...le.sets, next] }
      })
    },
    [mutateExercise],
  )

  const removeSet = useCallback(
    (loggedExerciseId: string, setId: string) => {
      mutateExercise(loggedExerciseId, (le) => ({
        ...le,
        sets: le.sets.filter((s) => s.id !== setId),
      }))
    },
    [mutateExercise],
  )

  const updateSet = useCallback(
    (loggedExerciseId: string, setId: string, patch: Partial<LoggedSet>) => {
      mutateExercise(loggedExerciseId, (le) => ({
        ...le,
        sets: le.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
      }))
    },
    [mutateExercise],
  )

  const updateExercise = useCallback(
    (loggedExerciseId: string, patch: Partial<Omit<LoggedExercise, 'sets' | 'id'>>) => {
      mutateExercise(loggedExerciseId, (le) => ({ ...le, ...patch }))
    },
    [mutateExercise],
  )

  const setName = useCallback((name: string) => mutate((w) => ({ ...w, name })), [mutate])
  const setNotes = useCallback((notes: string) => mutate((w) => ({ ...w, notes })), [mutate])

  const finish = useCallback(async (rating?: SessionRating) => {
    if (!workout) return null
    const settings = await db.settings.get(1)
    const all = await db.exercises.bulkGet([...new Set(workout.exercises.map((e) => e.exerciseId))])
    const byId = new Map(all.filter((e) => e !== undefined).map((e) => [e.id, e]))

    // Drop empty placeholder sets and exercises so history stays clean.
    const exercises = workout.exercises
      .map((le) => ({ ...le, sets: le.sets.filter(isSetLogged) }))
      .filter((le) => le.sets.length > 0)

    const totals = computeTotals(
      exercises,
      byId,
      settings?.bodyweightKg ?? null,
      settings?.countWarmupSets ?? false,
    )
    const finished: Workout = {
      ...workout,
      exercises,
      exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))],
      status: 'done',
      finishedAt: Date.now(),
      bodyweightKg: settings?.bodyweightKg ?? null,
      totalVolumeKg: totals.totalVolumeKg,
      totalSets: totals.totalSets,
      totalReps: totals.totalReps,
      // Written with the session rather than patched in afterwards, so a
      // rated workout is never briefly stored unrated.
      ...(rating?.effort !== undefined ? { effort: rating.effort } : {}),
      ...(rating?.feeling !== undefined ? { feeling: rating.feeling } : {}),
    }
    await db.workouts.put(finished)
    if (finished.routineId) {
      const routine = await db.routines.get(finished.routineId)
      if (routine) {
        await db.routines.put({ ...routine, lastPerformedAt: finished.finishedAt })
      }
    }
    dirtyRef.current = false
    setWorkout(null)
    return finished.id
  }, [workout])

  const discard = useCallback(async () => {
    if (!workout) return
    await db.workouts.delete(workout.id)
    dirtyRef.current = false
    setWorkout(null)
  }, [workout])

  const value = useMemo<ActiveWorkoutValue>(
    () => ({
      workout,
      loading,
      startEmpty,
      startFromRoutine,
      addExercises,
      removeExercise,
      replaceExercise,
      moveExercise,
      reorderExercises,
      addSet,
      removeSet,
      updateSet,
      updateExercise,
      setName,
      setNotes,
      finish,
      discard,
    }),
    [
      workout,
      loading,
      startEmpty,
      startFromRoutine,
      addExercises,
      removeExercise,
      replaceExercise,
      moveExercise,
      reorderExercises,
      addSet,
      removeSet,
      updateSet,
      updateExercise,
      setName,
      setNotes,
      finish,
      discard,
    ],
  )

  return <ActiveWorkoutContext.Provider value={value}>{children}</ActiveWorkoutContext.Provider>
}

export function useActiveWorkout(): ActiveWorkoutValue {
  const ctx = useContext(ActiveWorkoutContext)
  if (!ctx) throw new Error('useActiveWorkout must be used inside ActiveWorkoutProvider')
  return ctx
}
