import type { DistanceUnit, Exercise, LoggedExercise, LoggedSet, WeightUnit, Workout } from '../../db/types'
import { newId } from '../../db/db'
import { computeTotals } from '../workout'
import { displayToKg, displayToMetres } from '../units'
import { parseCsv, sniffDelimiter, toRecords } from './csv'
import {
  buildSetValues,
  ExerciseResolver,
  normalizeSetType,
  parseFloatOrNull,
  type ParsedImport,
  type RowShape,
} from './shared'

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

function parseHevyDate(s: string): number | null {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4}),?\s+(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const [, d, mon, y, h, mi] = m
  const month = MONTHS[mon.toLowerCase()]
  if (month === undefined) return null
  return new Date(Number(y), month, Number(d), Number(h), Number(mi)).getTime()
}

interface RawRow {
  weightKg: number | null
  reps: number | null
  durationSec: number | null
  distanceM: number | null
  rpe: number | null
  setType: string
}

interface ExGroup {
  name: string
  rows: RawRow[]
  notes: string
  supersetId: string
}

interface WoGroup {
  name: string
  startedAt: number
  finishedAt: number
  notes: string
  exercises: Map<string, ExGroup>
  order: string[]
}

/**
 * Hevy's CSV header discloses the unit ("weight_kg" vs "weight_lbs",
 * "distance_km" vs "distance_miles") — unlike Strong, no need to ask.
 */
export function parseHevyCsv(
  text: string,
  existingExercises: Exercise[],
  bodyweightKg: number | null,
): ParsedImport {
  const rows = parseCsv(text, sniffDelimiter(text.split(/\r?\n/)[0] ?? ''))
  const headerLower = (rows[0] ?? []).map((h) => h.trim().toLowerCase())
  const weightUnit: WeightUnit = headerLower.includes('weight_lbs') ? 'lb' : 'kg'
  const distanceUnit: DistanceUnit = headerLower.includes('distance_miles') ? 'mi' : 'km'
  const weightKey = weightUnit === 'lb' ? 'weight_lbs' : 'weight_kg'
  const distanceKey = distanceUnit === 'mi' ? 'distance_miles' : 'distance_km'

  const records = toRecords(rows)
  const resolver = new ExerciseResolver(existingExercises)
  const warnings: string[] = []

  const workoutGroups = new Map<string, WoGroup>()
  const workoutOrder: string[] = []

  for (const rec of records) {
    const title = rec['title']?.trim()
    const startStr = rec['start_time']
    const exerciseName = rec['exercise_title']?.trim()
    if (!startStr || !exerciseName) {
      warnings.push('Skipped a row missing a start time or exercise name.')
      continue
    }
    const startedAt = parseHevyDate(startStr)
    if (startedAt === null) {
      warnings.push(`Skipped a row with an unreadable date: "${startStr}".`)
      continue
    }

    const woKey = `${title}|${startStr}`
    let wo = workoutGroups.get(woKey)
    if (!wo) {
      const endedAt = parseHevyDate(rec['end_time'] ?? '')
      wo = {
        name: title || 'Workout',
        startedAt,
        finishedAt: endedAt ?? startedAt,
        notes: '',
        exercises: new Map(),
        order: [],
      }
      workoutGroups.set(woKey, wo)
      workoutOrder.push(woKey)
    }
    if (!wo.notes && rec['description']?.trim()) wo.notes = rec['description'].trim()

    let ex = wo.exercises.get(exerciseName)
    if (!ex) {
      ex = { name: exerciseName, rows: [], notes: '', supersetId: '' }
      wo.exercises.set(exerciseName, ex)
      wo.order.push(exerciseName)
    }
    if (!ex.notes && rec['exercise_notes']?.trim()) ex.notes = rec['exercise_notes'].trim()
    if (!ex.supersetId && rec['superset_id']?.trim()) ex.supersetId = rec['superset_id'].trim()

    const weightRaw = parseFloatOrNull(rec[weightKey])
    const distanceRaw = parseFloatOrNull(rec[distanceKey])
    const repsRaw = parseFloatOrNull(rec['reps'])
    ex.rows.push({
      weightKg: weightRaw !== null ? displayToKg(weightRaw, weightUnit) : null,
      reps: repsRaw !== null ? Math.round(repsRaw) : null,
      durationSec: parseFloatOrNull(rec['duration_seconds']),
      distanceM: distanceRaw !== null ? displayToMetres(distanceRaw, distanceUnit) : null,
      rpe: parseFloatOrNull(rec['rpe']),
      setType: rec['set_type'] ?? '',
    })
  }

  const exerciseById = new Map(existingExercises.map((e) => [e.id, e] as const))
  const workouts: Workout[] = []

  for (const key of workoutOrder) {
    const wo = workoutGroups.get(key)!
    const loggedExercises: LoggedExercise[] = []
    const exerciseIds: string[] = []

    const supersetNumbers = new Map<string, number>()
    for (const name of wo.order) {
      const id = wo.exercises.get(name)!.supersetId
      if (id && !supersetNumbers.has(id)) supersetNumbers.set(id, supersetNumbers.size)
    }

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
        setType: normalizeSetType(r.setType),
        completed: true,
      }))

      loggedExercises.push({
        id: newId(),
        exerciseId: exercise.id,
        notes: group.notes || undefined,
        supersetGroup: group.supersetId ? (supersetNumbers.get(group.supersetId) ?? null) : null,
        sets,
      })
    }

    const totals = computeTotals(loggedExercises, exerciseById, bodyweightKg)

    workouts.push({
      id: newId(),
      name: wo.name,
      status: 'done',
      startedAt: wo.startedAt,
      finishedAt: wo.finishedAt,
      pausedSec: 0,
      notes: wo.notes || undefined,
      exercises: loggedExercises,
      exerciseIds: Array.from(new Set(exerciseIds)),
      totalVolumeKg: totals.totalVolumeKg,
      totalSets: totals.totalSets,
      totalReps: totals.totalReps,
    })
  }

  return { source: 'hevy', newExercises: resolver.created, workouts, warnings }
}
