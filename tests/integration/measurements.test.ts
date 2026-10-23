import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb } from '../../src/db/db'
import { latestOf, saveMeasurement } from '../../src/lib/measurements'
import { resetDb } from './helpers'

beforeEach(async () => {
  await resetDb()
  await initDb()
})

const DAY = new Date(2026, 9, 20).getTime()

describe('same-day measurements', () => {
  it('the later entry is the latest, and it sets the bodyweight setting', async () => {
    await saveMeasurement('bodyweight', 70, DAY)
    await saveMeasurement('bodyweight', 71, DAY)
    expect((await latestOf('bodyweight'))?.value).toBe(71)
    expect((await db.settings.get(1))?.bodyweightKg).toBe(71)
  })

  it('keeps entries on the same date and does not touch other days', async () => {
    await saveMeasurement('bodyweight', 70, DAY)
    await saveMeasurement('bodyweight', 71, DAY)
    await saveMeasurement('bodyweight', 69, DAY - 86_400_000)
    const rows = await db.measurements.toArray()
    const day = (t: number) => new Date(t).toDateString()
    expect(rows.filter((r) => day(r.takenAt) === day(DAY))).toHaveLength(2)
    expect(rows.find((r) => r.value === 69)?.takenAt).toBe(DAY - 86_400_000)
  })
})
