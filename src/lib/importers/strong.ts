import type { DistanceUnit, Exercise, LoggedExercise, LoggedSet, SetType, WeightUnit, Workout } from '../../db/types'
import { newId } from '../../db/db'
import { computeTotals } from '../workout'
import { displayToKg, METRES_PER_MILE } from '../units'
import { parseCsv, sniffDelimiter, toRecords } from './csv'
import {
  buildSetValues,
  detectDistanceUnitFromHeader,
  detectWeightUnitFromHeader,
  ExerciseResolver,
  findHeaderKey,
  isSecondsHeader,
  parseClockDuration,
  parseFloatOrNull,
  setTypeFromStrongOrder,
  type ParsedImport,
  type RowShape,
} from './shared'

function parseStrongDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se)).getTime()
}

function headerRow(text: string): { headers: string[]; delimiter: string } {
  const firstLine = text.split(/\r?\n/)[0] ?? ''
  const delimiter = sniffDelimiter(firstLine)
  const headers = (parseCsv(firstLine, delimiter)[0] ?? []).map((h) => h.trim().toLowerCase())
  return { headers, delimiter }
}

/**
 * Whether the file's own header discloses Weight/Distance units (e.g.
 * "Weight (kg)", "Distance (meters)") — some Strong export variants do,
 * others just say "Weight" and leave it to whatever the app was set to.
 * The caller uses this to decide whether the user needs to be asked.
 */
export function sniffStrongDisclosedUnits(text: string): { weight: boolean; distance: boolean } {
  const { headers } = headerRow(text)
  const weightKey = findHeaderKey(headers, ['weight'])
  const distanceKey = findHeaderKey(headers, ['distance'])
  return {
    weight: detectWeightUnitFromHeader(weightKey) !== null,
    distance: detectDistanceUnitFromHeader(distanceKey) !== null,
  }
}

function distanceToMetres(value: number, unit: 'm' | 'km' | 'mi'): number {
  if (unit === 'm') return value
  if (unit === 'km') return value * 1000
  return value * METRES_PER_MILE
}

interface RawRow {
  weightKg: number | null
  reps: number | null
  durationSec: number | null
  distanceM: number | null
  rpe: number | null
  setType: SetType
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
 * Some Strong export variants disclose units right in the header
 * ("Weight (kg)", "Distance (meters)"); others just say "Weight" and follow
 * whatever the app was set to at export time. `opts` is the fallback for
 * whichever dimension the header doesn't disclose.
 */
export function parseStrongCsv(
  text: string,
  opts: StrongImportOptions,
  existingExercises: Exercise[],
  bodyweightKg: number | null,
): ParsedImport {
  const { headers, delimiter } = headerRow(text)
  const records = toRecords(parseCsv(text, delimiter))

  const dateKey = findHeaderKey(headers, ['date']) ?? 'date'
  const workoutNameKey = findHeaderKey(headers, ['workout name']) ?? 'workout name'
  const durationKey = findHeaderKey(headers, ['duration'])
  const exerciseNameKey = findHeaderKey(headers, ['exercise name']) ?? 'exercise name'
  const setOrderKey = findHeaderKey(headers, ['set order']) ?? 'set order'
  const weightKey = findHeaderKey(headers, ['weight'])
  const repsKey = findHeaderKey(headers, ['reps']) ?? 'reps'
  const rpeKey = findHeaderKey(headers, ['rpe']) ?? 'rpe'
  const distanceKey = findHeaderKey(headers, ['distance'])
  const secondsKey = findHeaderKey(headers, ['seconds']) ?? 'seconds'
  const notesKey = findHeaderKey(headers, ['notes']) ?? 'notes'
  const workoutNotesKey = findHeaderKey(headers, ['workout notes']) ?? 'workout notes'

  const weightUnit = detectWeightUnitFromHeader(weightKey) ?? opts.weightUnit
  const distanceUnit = detectDistanceUnitFromHeader(distanceKey) ?? opts.distanceUnit
  const durationIsSeconds = isSecondsHeader(durationKey)

  const resolver = new ExerciseResolver(existingExercises)
  const warnings: string[] = []

  const workoutGroups = new Map<string, WoGroup>()
  const workoutOrder: string[] = []

  for (const rec of records) {
    const dateStr = rec[dateKey]
    const exerciseName = rec[exerciseNameKey]?.trim()
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
      const durationRaw = durationKey ? rec[durationKey] : ''
      wo = {
        name: rec[workoutNameKey]?.trim() || 'Workout',
        startedAt,
        durationSec: durationIsSeconds
          ? Math.round(parseFloatOrNull(durationRaw) ?? 0)
          : parseClockDuration(durationRaw ?? ''),
        notes: '',
        exercises: new Map(),
        order: [],
      }
      workoutGroups.set(dateStr, wo)
      workoutOrder.push(dateStr)
    }
    if (!wo.notes && rec[workoutNotesKey]?.trim()) wo.notes = rec[workoutNotesKey].trim()

    let ex = wo.exercises.get(exerciseName)
    if (!ex) {
      ex = { name: exerciseName, rows: [], notes: '' }
      wo.exercises.set(exerciseName, ex)
      wo.order.push(exerciseName)
    }
    if (!ex.notes && rec[notesKey]?.trim()) ex.notes = rec[notesKey].trim()

    // "Note" and "Rest Timer" rows carry metadata (already captured above),
    // not an actual performed set — skip them rather than logging a ghost set.
    const setOrderRaw = (rec[setOrderKey] ?? '').trim()
    const setOrderLower = setOrderRaw.toLowerCase()
    if (setOrderLower === 'note' || setOrderLower === 'rest timer') continue

    const weightRaw = parseFloatOrNull(weightKey ? rec[weightKey] : undefined)
    const distanceRaw = parseFloatOrNull(distanceKey ? rec[distanceKey] : undefined)
    const repsRaw = parseFloatOrNull(rec[repsKey])
    ex.rows.push({
      weightKg: weightRaw !== null ? displayToKg(weightRaw, weightUnit) : null,
      reps: repsRaw !== null ? Math.round(repsRaw) : null,
      durationSec: parseFloatOrNull(rec[secondsKey]),
      distanceM: distanceRaw !== null ? distanceToMetres(distanceRaw, distanceUnit) : null,
      rpe: parseFloatOrNull(rec[rpeKey]),
      setType: setTypeFromStrongOrder(setOrderRaw),
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
      if (group.rows.length === 0) continue // only "Note"/"Rest Timer" rows — nothing was actually logged

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
        setType: r.setType,
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
