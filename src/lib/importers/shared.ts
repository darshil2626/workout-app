import type { Exercise, ExerciseKind, SetType, Workout } from '../../db/types'
import { newId } from '../../db/db'
import { fieldsFor } from '../workout'
import { ExerciseIndex, hintFromName, inferKind } from '../exerciseMatch'
import type { NameHint, RowShape } from '../exerciseMatch'

export { hintFromName, inferKind }
export type { NameHint, RowShape }

export interface ParsedImport {
  source: 'strong' | 'hevy'
  newExercises: Exercise[]
  workouts: Workout[]
  /** Rows that couldn't be placed into a workout (e.g. missing exercise name), by reason. */
  warnings: string[]
}

/**
 * Resolves an exercise name to a library entry, reusing an existing one where
 * the movement matches and otherwise creating a custom entry that is at least
 * classified — see exerciseMatch.ts for the rules. Shared across one import run
 * so the same new name only gets created once.
 */
export class ExerciseResolver {
  private index: ExerciseIndex
  readonly created: Exercise[] = []

  constructor(existing: Exercise[]) {
    this.index = new ExerciseIndex(existing)
  }

  resolve(name: string, shape: RowShape): Exercise {
    const match = this.index.match(name, shape)
    if (match.exercise) return match.exercise

    const exercise: Exercise = {
      id: newId(),
      name: name.trim(),
      ...match.classify,
      isCustom: true,
      createdAt: Date.now(),
    }
    // Added to the index so a second row for the same new name reuses it.
    this.index.add(exercise)
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

/**
 * Strong's "Set Order" column is usually numeric, but also carries single-letter
 * set-type codes (seen in the wild: "F" for a to-failure set) alongside the
 * word forms normalizeSetType already understands.
 */
export function setTypeFromStrongOrder(raw: string): SetType {
  const s = raw.trim().toLowerCase()
  if (s === 'f') return 'failure'
  if (s === 'w' || s === 'wu') return 'warmup'
  if (s === 'd') return 'drop'
  return normalizeSetType(raw)
}

/**
 * Finds the header key matching one of `candidates`, tolerating a trailing
 * unit annotation some Strong export variants add, e.g. "weight" also matches
 * "weight (kg)". Headers must already be lowercased (as toRecords produces).
 */
export function findHeaderKey(headers: string[], candidates: string[]): string | null {
  for (const h of headers) {
    for (const c of candidates) {
      if (h === c || h.startsWith(`${c} (`) || h.startsWith(`${c}(`)) return h
    }
  }
  return null
}

/** Reads a unit disclosed in a header's "(...)" suffix, e.g. "weight (kg)" → 'kg'. */
export function detectWeightUnitFromHeader(headerKey: string | null): 'kg' | 'lb' | null {
  if (!headerKey) return null
  if (/\(lbs?\)/.test(headerKey)) return 'lb'
  if (/\(kgs?\)/.test(headerKey)) return 'kg'
  return null
}

/** Reads a distance unit disclosed in a header's "(...)" suffix. 'm' means the raw value is already metres. */
export function detectDistanceUnitFromHeader(headerKey: string | null): 'm' | 'km' | 'mi' | null {
  if (!headerKey) return null
  if (/\(met(?:er|re)s?\)|\(m\)/.test(headerKey)) return 'm'
  if (/\(km\)|\(kilomet(?:er|re)s?\)/.test(headerKey)) return 'km'
  if (/\(miles?\)|\(mi\)/.test(headerKey)) return 'mi'
  return null
}

/** Whether a duration header's own label already says seconds, e.g. "duration (sec)". */
export function isSecondsHeader(headerKey: string | null): boolean {
  if (!headerKey) return false
  return /\(sec(?:ond)?s?\)/.test(headerKey)
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
