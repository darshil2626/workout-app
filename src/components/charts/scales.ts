/** Shared plot geometry and tick maths for the SVG charts. */

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}

/**
 * Rounds an axis to human numbers (0 / 500 / 1,000) and returns ticks that
 * always include the domain. `count` is a target, not a guarantee.
 */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0]
  if (max === min) {
    // A flat series still needs two ticks or the axis reads as broken.
    return max === 0 ? [0, 1] : [0, max]
  }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  // Guard against floating-point drift producing a runaway loop.
  for (let v = start, i = 0; v <= end + step / 2 && i < 64; v += step, i++) {
    ticks.push(Math.round(v / step) * step)
  }
  return ticks
}

/** Compact axis/tooltip numbers: 1284 → "1.3k", 12900 → "12.9k". */
export function compactNumber(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${trim(v / 1_000_000)}M`
  if (abs >= 1_000) return `${trim(v / 1_000)}k`
  return trim(v)
}

function trim(v: number): string {
  const rounded = Math.round(v * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function makeScale(domainMin: number, domainMax: number, rangeMin: number, rangeMax: number) {
  const span = domainMax - domainMin
  return (v: number) =>
    span === 0
      ? (rangeMin + rangeMax) / 2
      : rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin)
}

const DAY_MS = 86400000

type TimeUnit = 'day' | 'month' | 'year'

/**
 * Candidate axis steps, coarsest-last. Calendar units rather than fixed
 * millisecond spans, so month and year ticks land on the 1st and on January
 * instead of drifting.
 */
const TIME_STEPS: { unit: TimeUnit; step: number }[] = [
  { unit: 'day', step: 1 },
  { unit: 'day', step: 2 },
  { unit: 'day', step: 7 },
  { unit: 'day', step: 14 },
  { unit: 'month', step: 1 },
  { unit: 'month', step: 3 },
  { unit: 'month', step: 6 },
  { unit: 'year', step: 1 },
  { unit: 'year', step: 2 },
  { unit: 'year', step: 5 },
  { unit: 'year', step: 10 },
]

const APPROX_MS: Record<TimeUnit, number> = {
  day: DAY_MS,
  month: 30.44 * DAY_MS,
  year: 365.25 * DAY_MS,
}

function advance(d: Date, unit: TimeUnit, step: number): void {
  if (unit === 'day') d.setDate(d.getDate() + step)
  else if (unit === 'month') d.setMonth(d.getMonth() + step)
  else d.setFullYear(d.getFullYear() + step)
}

/**
 * Date ticks across a real time span. A training history can cover a decade or
 * a fortnight, so the step is chosen from the span rather than fixed: the
 * coarsest step that still fits inside `target` ticks.
 */
export function timeTicks(minTs: number, maxTs: number, target = 4): number[] {
  if (!Number.isFinite(minTs) || !Number.isFinite(maxTs)) return []
  const span = maxTs - minTs
  if (span <= 0) return [minTs]

  const pick =
    TIME_STEPS.find((s) => span / (APPROX_MS[s.unit] * s.step) <= target) ??
    TIME_STEPS[TIME_STEPS.length - 1]

  // Floor to the step's own boundary, then walk forward into the range.
  const cursor = new Date(minTs)
  cursor.setHours(0, 0, 0, 0)
  if (pick.unit === 'month') {
    cursor.setDate(1)
    cursor.setMonth(Math.floor(cursor.getMonth() / pick.step) * pick.step)
  } else if (pick.unit === 'year') {
    cursor.setMonth(0, 1)
    cursor.setFullYear(Math.floor(cursor.getFullYear() / pick.step) * pick.step)
  }

  const ticks: number[] = []
  // Bounded loops: a pathological span must not spin.
  for (let i = 0; cursor.getTime() < minTs && i < 64; i++) advance(cursor, pick.unit, pick.step)
  for (let i = 0; cursor.getTime() <= maxTs && i < 64; i++) {
    ticks.push(cursor.getTime())
    advance(cursor, pick.unit, pick.step)
  }
  return ticks
}

/**
 * Tick labels sized to the span: a day-and-month label is meaningless across
 * five years, and a bare year is useless across three weeks.
 */
export function timeTickFormatter(spanMs: number): (ts: number) => string {
  if (spanMs <= 70 * DAY_MS) {
    return (ts) => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }
  if (spanMs <= 400 * DAY_MS) {
    return (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short' })
  }
  if (spanMs <= 3 * 365 * DAY_MS) {
    return (ts) =>
      new Date(ts).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  }
  return (ts) => String(new Date(ts).getFullYear())
}
