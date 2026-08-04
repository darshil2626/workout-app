import type { DistanceUnit, Exercise, LoggedExercise, LoggedSet, WeightUnit, Workout } from '../../db/types'
import { newId } from '../../db/db'
import { computeTotals } from '../workout'
import { displayToKg, displayToMetres } from '../units'
import { parseCsv, sniffDelimiter, toRecords } from './csv'
import {
  buildSetValues,
  ExerciseResolver,
  parseClockDuration,
  parseFloatOrNull,
  type ParsedImport,
  type RowShape,
} from './shared'

function parseStrongDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se)).getTime()
}

interface RawRow {
  weightKg: number | null
  reps: number | null
  durationSec: number | null
  distanceM: number | null
  rpe: number | null
}

interface ExGroup {
  name: string
  rows: RawRow[]
  notes: string
}

interface WoGroup {
  name: string
  startedAt: number
  durationSec: number
  notes: string
  exercises: Map<string, ExGroup>
  order: string[]
}

export interface StrongImportOptions {
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
}

/**
 * Strong's CSV never records which unit Weight/Distance are in — it just
 * follows whatever the app was set to at export time — so the caller must
 * ask the user and pass it in.
 */
export function parseStrongCsv(
  text: string,
  opts: StrongImportOptions,
  existingExercises: Exercise[],
  bodyweightKg: number | null,
): ParsedImport {
  const delimiter = sniffDelimiter(text.split(/\r?\n/)[0] ?? '')
  const records = toRecords(parseCsv(text, delimiter))
  const resolver = new ExerciseResolver(existingExercises)
  const warnings: string[] = []

  const workoutGroups = new Map<string, WoGroup>()
  const workoutOrder: string[] = []

  for (const rec of records) {
    const dateStr = rec['date']
    const exerciseName = rec['exercise name']?.trim()
    if (!dateStr || !exerciseName) {
      warnings.push('Skipped a row missing a date or exercise name.')
      continue
    }
    const startedAt = parseStrongDate(dateStr)
    if (startedAt === null) {
      warnings.push(`Skipped a row with an unreadable date: "${dateStr}".`)
      continue
    }

    let wo = workoutGroups.get(dateStr)
    if (!wo) {
      wo = {
        name: rec['workout name']?.trim() || 'Workout',
        startedAt,
        durationSec: parseClockDuration(rec['duration'] ?? ''),
        notes: '',
        exercises: new Map(),
        order: [],
      }
      workoutGroups.set(dateStr, wo)
      workoutOrder.push(dateStr)
    }
    if (!wo.notes && rec['workout notes']?.trim()) wo.notes = rec['workout notes'].trim()

    let ex = wo.exercises.get(exerciseName)
    if (!ex) {
      ex = { name: exerciseName, rows: [], notes: '' }
      wo.exercises.set(exerciseName, ex)
      wo.order.push(exerciseName)
    }
    if (!ex.notes && rec['notes']?.trim()) ex.notes = rec['notes'].trim()

    const weightRaw = parseFloatOrNull(rec['weight'])
    const distanceRaw = parseFloatOrNull(rec['distance'])
    const repsRaw = parseFloatOrNull(rec['reps'])
    ex.rows.push({
      weightKg: weightRaw !== null ? displayToKg(weightRaw, opts.weightUnit) : null,
      reps: repsRaw !== null ? Math.round(repsRaw) : null,
      durationSec: parseFloatOrNull(rec['seconds']),
      distanceM: distanceRaw !== null ? displayToMetres(distanceRaw, opts.distanceUnit) : null,
      rpe: parseFloatOrNull(rec['rpe']),
    })
  }

  const exerciseById = new Map(existingExercises.map((e) => [e.id, e] as const))
  const workouts: Workout[] = []

  for (const key of workoutOrder) {
    const wo = workoutGroups.get(key)!
    const loggedExercises: LoggedExercise[] = []
    const exerciseIds: string[] = []

    for (const name of wo.order) {
      const group = wo.exercises.get(name)!
      const shape: RowShape = {
        hasWeight: group.rows.some((r) => (r.weightKg ?? 0) > 0),
        hasReps: group.rows.some((r) => (r.reps ?? 0) > 0),
        hasDuration: group.rows.some((r) => (r.durationSec ?? 0) > 0),
        hasDistance: group.rows.some((r) => (r.distanceM ?? 0) > 0),
      }
      const exercise = resolver.resolve(name, shape)
      exerciseById.set(exercise.id, exercise)
      exerciseIds.push(exercise.id)

      const sets: LoggedSet[] = group.rows.map((r) => ({
        id: newId(),
        ...buildSetValues(exercise.kind, r),
        rpe: r.rpe,
        setType: 'normal',
        completed: true,
      }))

      loggedExercises.push({
        id: newId(),
        exerciseId: exercise.id,
        notes: group.notes || undefined,
        supersetGroup: null,
        sets,
      })
    }

    const totals = computeTotals(loggedExercises, exerciseById, bodyweightKg)
    const finishedAt = wo.durationSec > 0 ? wo.startedAt + wo.durationSec * 1000 : wo.startedAt

    workouts.push({
      id: newId(),
      name: wo.name,
      status: 'done',
      startedAt: wo.startedAt,
      finishedAt,
      pausedSec: 0,
      notes: wo.notes || undefined,
      exercises: loggedExercises,
      exerciseIds: Array.from(new Set(exerciseIds)),
      totalVolumeKg: totals.totalVolumeKg,
      totalSets: totals.totalSets,
      totalReps: totals.totalReps,
    })
  }

  return { source: 'strong', newExercises: resolver.created, workouts, warnings }
}
