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
