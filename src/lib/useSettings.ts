import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_SETTINGS, db } from '../db/db'
import type { Settings } from '../db/types'
import { formatDistance, formatVolume, formatWeight } from './units'
import { formatDuration } from './time'

/**
 * Settings are read live so a unit change re-renders every screen at once.
 * Falls back to defaults during the first tick before Dexie resolves.
 */
export function useSettings(): Settings {
  const settings = useLiveQuery(() => db.settings.get(1), [], undefined)
  return settings ?? DEFAULT_SETTINGS
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const current = (await db.settings.get(1)) ?? DEFAULT_SETTINGS
  await db.settings.put({ ...current, ...patch, id: 1 })
}

/** Bundle of unit-aware formatters, so components don't thread `settings` around. */
export function useFormatters() {
  const settings = useSettings()
  return {
    settings,
    weightUnit: settings.weightUnit,
    distanceUnit: settings.distanceUnit,
    weight: (kg: number | null) => formatWeight(kg, settings.weightUnit),
    weightWithUnit: (kg: number | null) =>
      kg === null ? '—' : `${formatWeight(kg, settings.weightUnit)} ${settings.weightUnit}`,
    volume: (kg: number) => formatVolume(kg, settings.weightUnit),
    distance: (m: number | null) => formatDistance(m, settings.distanceUnit),
    distanceWithUnit: (m: number | null) =>
      m === null ? '—' : `${formatDistance(m, settings.distanceUnit)} ${settings.distanceUnit}`,
    duration: (s: number) => formatDuration(s),
  }
}

export type Formatters = ReturnType<typeof useFormatters>
