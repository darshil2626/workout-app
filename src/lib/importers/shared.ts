import type { Equipment, Exercise, ExerciseKind, SetType, Workout } from '../../db/types'
import { newId } from '../../db/db'
import { fieldsFor } from '../workout'

export interface ParsedImport {
  source: 'strong' | 'hevy'
  newExercises: Exercise[]
  workouts: Workout[]
  /** Rows that couldn't be placed into a workout (e.g. missing exercise name), by reason. */
  warnings: string[]
}

/** Both Strong and Hevy name exercises "Base Name (Equipment)", same convention this app's library uses. */
const EQUIPMENT_ALIASES: Record<string, Equipment> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Machine',
  cable: 'Cable',
  bodyweight: 'Bodyweight',
  kettlebell: 'Kettlebell',
  band: 'Band',
  plate: 'Plate',
  'smith machine': 'Smith Machine',
}

const KIND_HINT_ALIASES: Record<string, ExerciseKind> = {
  assisted: 'assisted_bodyweight',
  weighted: 'weighted_bodyweight',
}

export interface NameHint {
  equipment: Equipment
  kindHint: ExerciseKind | null
}

/** Reads the "(Equipment)" suffix off an exercise name, if present. */
export function hintFromName(name: string): NameHint {
  const m = /\(([^)]+)\)\s*$/.exec(name.trim())
  if (!m) return { equipment: 'Other', kindHint: null }
  const token = m[1].trim().toLowerCase()
  if (token in KIND_HINT_ALIASES) return { equipment: 'Bodyweight', kindHint: KIND_HINT_ALIASES[token] }
  if (token in EQUIPMENT_ALIASES) return { equipment: EQUIPMENT_ALIASES[token], kindHint: null }
  return { equipment: 'Other', kindHint: null }
}

export interface RowShape {
  hasWeight: boolean
  hasReps: boolean
  hasDuration: boolean
  hasDistance: boolean
}

/** Infers an ExerciseKind for a brand-new exercise from the values actually seen for it. */
export function inferKind(shape: RowShape, hint: NameHint): ExerciseKind {
  if (hint.kindHint) return hint.kindHint
  if (shape.hasDistance) return 'distance_duration'
  if (shape.hasDuration && !shape.hasReps) return shape.hasWeight ? 'duration_weight' : 'duration'
  if (hint.equipment === 'Bodyweight' || (!shape.hasWeight && shape.hasReps)) return 'bodyweight_reps'
  if (shape.hasWeight && shape.hasReps) return 'weight_reps'
  return 'weight_reps'
}

/**
 * Resolves an exercise name to an id, reusing an existing library entry
 * (case-insensitive) or creating a new custom one. Shared across one import
 * run so the same new name only gets created once.
 */
export class ExerciseResolver {
  private byLowerName = new Map<string, Exercise>()
  readonly created: Exercise[] = []

  constructor(existing: Exercise[]) {
    for (const e of existing) this.byLowerName.set(e.name.trim().toLowerCase(), e)
  }

  resolve(name: string, shape: RowShape): Exercise {
    const key = name.trim().toLowerCase()
    const found = this.byLowerName.get(key)
    if (found) return found

    const hint = hintFromName(name)
    const exercise: Exercise = {
      id: newId(),
      name: name.trim(),
      muscleGroup: 'Other',
      equipment: hint.equipment,
      kind: inferKind(shape, hint),
      isCustom: true,
      createdAt: Date.now(),
    }
    this.byLowerName.set(key, exercise)
    this.created.push(exercise)
    return exercise
  }
}

export function normalizeSetType(raw: string | undefined): SetType {
  const s = (raw ?? '').trim().toLowerCase()
  if (s.includes('warm')) return 'warmup'
  if (s.includes('drop')) return 'drop'
  if (s.includes('fail')) return 'failure'
  return 'normal'
}

export function parseFloatOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const n = Number(raw.trim())
  return Number.isFinite(n) && raw.trim() !== '' ? n : null
}

/** Zeroes out fields an exercise kind doesn't use, so imported sets match native ones. */
export function buildSetValues(
  kind: ExerciseKind,
  raw: { weightKg: number | null; reps: number | null; durationSec: number | null; distanceM: number | null },
) {
  const fields = fieldsFor(kind)
  return {
    weight: fields.weight && raw.weightKg !== null ? raw.weightKg : null,
    reps: fields.reps && raw.reps !== null ? raw.reps : null,
    durationSec: fields.duration && raw.durationSec !== null && raw.durationSec > 0 ? raw.durationSec : null,
    distanceM: fields.distance && raw.distanceM !== null && raw.distanceM > 0 ? raw.distanceM : null,
  }
}

/** "2h 38m", "45m", "1h", "90s" → seconds. Missing/unrecognized text yields 0. */
export function parseClockDuration(text: string): number {
  const re = /(\d+(?:\.\d+)?)\s*(h|m|s)/gi
  let total = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    const value = Number(match[1])
    const unit = match[2].toLowerCase()
    if (unit === 'h') total += value * 3600
    else if (unit === 'm') total += value * 60
    else total += value
  }
  return Math.round(total)
}
