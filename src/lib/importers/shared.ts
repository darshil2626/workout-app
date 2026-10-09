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

/**
 * A number as another country writes it. Exports follow the phone's locale, so
 * a European file has "82,5" where an American one has "82.5", and a naive
 * Number() turns the first into NaN and silently drops the weight.
 *
 * Handles: plain numbers; one comma as the decimal mark ("82,5", "0,125");
 * both marks together, where the later one is the decimal ("1,234.5",
 * "1.234,5"); and a lone comma followed by exactly three digits as a thousands
 * group ("1,200"), unless the integer part is 0. Anything ambiguous or malformed
 * ("1.2.3", "1,2,3") is null, so the row is skipped rather than guessed at.
 */
export function parseFloatOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null
  const text = raw.trim()
  if (text === '') return null
  if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text)) return Number(text)

  const m = /^([+-]?)(\d[\d.,]*)$/.exec(text)
  if (!m) return null
  const [, sign, body] = m
  const lastComma = body.lastIndexOf(',')
  const lastDot = body.lastIndexOf('.')
  let normalised: string

  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? ',' : '.'
    const group = decimal === ',' ? '.' : ','
    if (body.split(decimal).length > 2) return null
    normalised = body.split(group).join('').replace(decimal, '.')
  } else if (lastComma >= 0) {
    const parts = body.split(',')
    if (parts.length === 2) {
      const [whole, fraction] = parts
      const thousands = fraction.length === 3 && whole !== '0' && whole.length <= 3
      normalised = thousands ? whole + fraction : `${whole}.${fraction}`
    } else if (parts.slice(1).every((p) => p.length === 3)) {
      normalised = parts.join('')
    } else {
      return null
    }
  } else {
    const parts = body.split('.')
    if (parts.length > 2 && parts.slice(1).every((p) => p.length === 3)) normalised = parts.join('')
    else return null
  }
  const n = Number(sign + normalised)
  return Number.isFinite(n) ? n : null
}

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

/** Local time, rejecting impossible dates (31 Feb) rather than rolling them over. */
function localTime(y: number, month: number, d: number, h: number, mi: number, s: number): number | null {
  const date = new Date(y, month, d, h, mi, s)
  const ok =
    date.getFullYear() === y &&
    date.getMonth() === month &&
    date.getDate() === d &&
    date.getHours() === h &&
    date.getMinutes() === mi
  return ok ? date.getTime() : null
}

function to24h(hour: number, meridiem: string | undefined): number | null {
  if (meridiem === undefined) return hour
  if (hour < 1 || hour > 12) return null
  return (hour % 12) + (meridiem.toLowerCase() === 'pm' ? 12 : 0)
}

/**
 * A timestamp as the exporting apps write it, in local time unless the text
 * carries its own zone. Accepts:
 *   2024-03-04 18:30:00   2024-03-04 18:30   2024-03-04T18:30:00Z / +01:00
 *   4 Mar 2024, 18:30     4 March 2024, 18:30
 *   Mar 4, 2024, 6:30 PM  March 4, 2024, 18:30
 * Anything else is null, which the importer reports as an unreadable date.
 */
export function parseImportDate(raw: string): number | null {
  const s = raw.trim()

  let m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(s)
  if (m) {
    const [, y, mo, d, h, mi, se, zone] = m
    const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se ?? 0)] as const
    if (!zone) return localTime(...parts)
    const utc = Date.UTC(...parts)
    if (zone.toUpperCase() === 'Z') return utc
    const sign = zone[0] === '-' ? -1 : 1
    const digits = zone.slice(1).replace(':', '')
    return utc - sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000
  }

  // "4 Mar 2024, 18:30" / "4 March 2024 6:30 PM"
  m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(s)
  let month: number | undefined
  let day: string | undefined
  if (m) {
    month = MONTHS[m[2].toLowerCase()]
    day = m[1]
  } else {
    // "Mar 4, 2024, 6:30 PM" / "March 4, 2024, 18:30"
    m = /^([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(s)
    if (!m) return null
    month = MONTHS[m[1].toLowerCase()]
    day = m[2]
  }
  if (month === undefined) return null
  const hour = to24h(Number(m[4]), m[7])
  if (hour === null) return null
  return localTime(Number(m[3]), month, Number(day), hour, Number(m[5]), Number(m[6] ?? 0))
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
