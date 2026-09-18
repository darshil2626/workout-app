import type { DistanceUnit, LengthUnit, WeightUnit } from '../db/types'

export const LB_PER_KG = 2.20462262185

/** Storage (kg) → display value in the user's chosen unit. */
export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

/** Display value in the user's chosen unit → storage (kg). */
export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG
}

/**
 * Formats a weight for display, trimming trailing zeros.
 * 2.5 → "2.5", 100.0 → "100", 100.25 → "100.25"
 */
export function formatWeight(kg: number | null | undefined, unit: WeightUnit): string {
  if (kg === null || kg === undefined) return ''
  const v = kgToDisplay(kg, unit)
  return trimNumber(v)
}

export function trimNumber(v: number, maxDecimals = 2): string {
  if (!Number.isFinite(v)) return ''
  const rounded = Math.round(v * 10 ** maxDecimals) / 10 ** maxDecimals
  return String(rounded)
}

/** Volume is large, so it reads better without decimals and with separators. */
export function formatVolume(kg: number, unit: WeightUnit): string {
  const v = kgToDisplay(kg, unit)
  return Math.round(v).toLocaleString()
}

/**
 * Volume for a stat tile. All-time totals reach seven digits once a few years
 * of training are imported, and "1,234,567" cannot fit a tile, so anything
 * past five digits is abbreviated. Smaller figures — a single session — are
 * left exact, since those are the ones worth reading precisely.
 */
export function formatVolumeCompact(kg: number, unit: WeightUnit): string {
  const v = kgToDisplay(kg, unit)
  const abs = Math.abs(v)
  // Thresholds sit just under each boundary so rounding never yields "1000k".
  if (abs >= 999_500) return `${trimNumber(v / 1_000_000, 2)}M`
  if (abs >= 99_500) return `${Math.round(v / 1_000)}k`
  if (abs >= 10_000) return `${trimNumber(v / 1_000, 1)}k`
  return Math.round(v).toLocaleString()
}

export const METRES_PER_MILE = 1609.344

export function metresToDisplay(m: number, unit: DistanceUnit): number {
  return unit === 'km' ? m / 1000 : m / METRES_PER_MILE
}

export function displayToMetres(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value * 1000 : value * METRES_PER_MILE
}

export function formatDistance(m: number | null | undefined, unit: DistanceUnit): string {
  if (m === null || m === undefined) return ''
  return trimNumber(metresToDisplay(m, unit), 2)
}

export const CM_PER_INCH = 2.54

export function cmToDisplay(cm: number, unit: LengthUnit): number {
  return unit === 'cm' ? cm : cm / CM_PER_INCH
}

export function displayToCm(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value : value * CM_PER_INCH
}

export function formatLength(cm: number | null | undefined, unit: LengthUnit): string {
  if (cm === null || cm === undefined) return ''
  return trimNumber(cmToDisplay(cm, unit), 1)
}

/**
 * Parses user text into a number, tolerating commas as decimal separators and
 * stripping stray characters. Returns null for anything unusable.
 */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(',', '.').replace(/[^0-9.]/g, '')
  if (cleaned === '' || cleaned === '.') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
