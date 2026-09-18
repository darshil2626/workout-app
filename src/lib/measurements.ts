import { db, newId } from '../db/db'
import type {
  LengthUnit,
  Measurement,
  MeasurementKind,
  MeasurementType,
  Settings,
  WeightUnit,
} from '../db/types'
import { cmToDisplay, displayToCm, displayToKg, kgToDisplay, trimNumber } from './units'

export interface MeasurementSpec {
  type: MeasurementType
  label: string
  kind: MeasurementKind
}

export const MEASUREMENT_SPECS: MeasurementSpec[] = [
  { type: 'bodyweight', label: 'Bodyweight', kind: 'weight' },
  { type: 'bodyFat', label: 'Body fat', kind: 'percent' },
  { type: 'neck', label: 'Neck', kind: 'length' },
  { type: 'shoulders', label: 'Shoulders', kind: 'length' },
  { type: 'chest', label: 'Chest', kind: 'length' },
  { type: 'waist', label: 'Waist', kind: 'length' },
  { type: 'hips', label: 'Hips', kind: 'length' },
  { type: 'leftBicep', label: 'Left bicep', kind: 'length' },
  { type: 'rightBicep', label: 'Right bicep', kind: 'length' },
  { type: 'leftForearm', label: 'Left forearm', kind: 'length' },
  { type: 'rightForearm', label: 'Right forearm', kind: 'length' },
  { type: 'leftThigh', label: 'Left thigh', kind: 'length' },
  { type: 'rightThigh', label: 'Right thigh', kind: 'length' },
  { type: 'leftCalf', label: 'Left calf', kind: 'length' },
  { type: 'rightCalf', label: 'Right calf', kind: 'length' },
]

export function specFor(type: MeasurementType): MeasurementSpec {
  // Every type in the union has a spec; the fallback only satisfies the compiler.
  return MEASUREMENT_SPECS.find((s) => s.type === type) ?? MEASUREMENT_SPECS[0]
}

/**
 * Bodyweight is read on a different scale to the one in the gym, so it carries
 * its own unit and only falls back to the lifting unit when unset.
 */
export function measurementWeightUnit(settings: Settings): WeightUnit {
  return settings.measurementWeightUnit ?? settings.weightUnit
}

/** Circumferences already have a dedicated setting; this names it for symmetry. */
export function measurementLengthUnit(settings: Settings): LengthUnit {
  return settings.lengthUnit
}

export function unitLabel(kind: MeasurementKind, settings: Settings): string {
  switch (kind) {
    case 'weight':
      return measurementWeightUnit(settings)
    case 'percent':
      return '%'
    case 'length':
      return measurementLengthUnit(settings)
  }
}

/** Canonical stored value → the number shown in the user's units. */
export function toDisplayValue(value: number, kind: MeasurementKind, settings: Settings): number {
  switch (kind) {
    case 'weight':
      return kgToDisplay(value, measurementWeightUnit(settings))
    case 'percent':
      return value
    case 'length':
      return cmToDisplay(value, measurementLengthUnit(settings))
  }
}

export function fromDisplayValue(value: number, kind: MeasurementKind, settings: Settings): number {
  switch (kind) {
    case 'weight':
      return displayToKg(value, measurementWeightUnit(settings))
    case 'percent':
      return value
    case 'length':
      return displayToCm(value, measurementLengthUnit(settings))
  }
}

export function formatMeasurement(value: number, kind: MeasurementKind, settings: Settings): string {
  return trimNumber(toDisplayValue(value, kind, settings), kind === 'weight' ? 2 : 1)
}

/**
 * Saves an entry. Bodyweight also updates the setting used to score bodyweight
 * exercises, so logging your weight keeps pull-up volume honest without a
 * second trip to Settings.
 */
export async function saveMeasurement(
  type: MeasurementType,
  canonicalValue: number,
  takenAt: number,
  notes?: string,
): Promise<void> {
  const record: Measurement = {
    id: newId(),
    type,
    value: canonicalValue,
    takenAt,
    notes: notes?.trim() || undefined,
  }
  await db.measurements.put(record)

  if (type === 'bodyweight') {
    const latest = await latestOf('bodyweight')
    // Only sync when this is the newest reading; back-filling an old weigh-in
    // must not overwrite the current one.
    if (!latest || latest.takenAt <= takenAt) {
      const settings = await db.settings.get(1)
      if (settings) await db.settings.put({ ...settings, bodyweightKg: canonicalValue })
    }
  }
}

export async function latestOf(type: MeasurementType): Promise<Measurement | undefined> {
  const rows = await db.measurements.where('type').equals(type).toArray()
  return rows.sort((a, b) => b.takenAt - a.takenAt)[0]
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db.measurements.delete(id)
}
