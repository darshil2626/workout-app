/**
 * Plate maths for barbell loading. All weights are kilograms.
 *
 * The bar is loaded symmetrically, so the solver works with *pairs*: it fills
 * half the remaining weight from the largest usable plate down.
 */

export interface PlateSolution {
  /** Plates for ONE side, heaviest first. */
  perSide: number[]
  /** Weight that could not be made from the available plates, in kg. */
  remainderKg: number
  /** Total the plates plus bar actually make. */
  achievedKg: number
  barKg: number
}

const EPSILON = 1e-6

export function solvePlates(
  targetKg: number,
  barKg: number,
  availablePlatesKg: number[],
): PlateSolution | null {
  // A target under the bar cannot be loaded at all.
  if (targetKg < barKg - EPSILON) return null

  const plates = [...new Set(availablePlatesKg)].filter((p) => p > 0).sort((a, b) => b - a)
  let remainingPerSide = (targetKg - barKg) / 2
  const perSide: number[] = []

  for (const plate of plates) {
    while (remainingPerSide >= plate - EPSILON) {
      perSide.push(plate)
      remainingPerSide -= plate
      // Guard against a pathological plate list producing an endless loop.
      if (perSide.length > 40) break
    }
  }

  const loadedPerSide = perSide.reduce((sum, p) => sum + p, 0)
  return {
    perSide,
    remainderKg: Math.max(0, remainingPerSide),
    achievedKg: barKg + loadedPerSide * 2,
    barKg,
  }
}

/** Groups a plate list into "2 × 20, 1 × 5" style counts, heaviest first. */
export function groupPlates(perSide: number[]): { plate: number; count: number }[] {
  const map = new Map<number, number>()
  for (const p of perSide) map.set(p, (map.get(p) ?? 0) + 1)
  return [...map.entries()]
    .map(([plate, count]) => ({ plate, count }))
    .sort((a, b) => b.plate - a.plate)
}

/** Common plate inventories offered in settings, in kilograms. */
export const PLATE_PRESETS: { label: string; platesKg: number[] }[] = [
  { label: 'Metric gym (25 → 1.25)', platesKg: [25, 20, 15, 10, 5, 2.5, 1.25] },
  { label: 'Metric + fractional', platesKg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5, 0.25] },
  { label: 'Pounds (45 → 2.5)', platesKg: [45, 35, 25, 10, 5, 2.5].map(lbToKg) },
  { label: 'Home gym (20 → 1.25)', platesKg: [20, 10, 5, 2.5, 1.25] },
]

function lbToKg(lb: number): number {
  return lb / 2.20462262185
}

export const BAR_PRESETS_KG = [20, 15, 10, 25, lbToKg(45), lbToKg(35)]
