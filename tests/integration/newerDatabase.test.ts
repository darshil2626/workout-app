import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb } from '../../src/db/db'
import { buildBackup } from '../../src/lib/backup'
import { logged, resetDb, set, workout } from './helpers'

// A phone can end up running an older build against a database a newer build has
// already upgraded (a stale cached page, or a rollback). The release docs promise
// that this does not lose data, so it is checked here against the real schema.

beforeEach(resetDb)

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

/** Plays the part of a future build: opens the same database at a higher version with an extra store. */
async function upgradeLikeAFutureBuild(): Promise<void> {
  db.close()
  const open = indexedDB.open('trana', db.verno * 10 + 50)
  open.onupgradeneeded = () => {
    open.result.createObjectStore('futureStore', { keyPath: 'id' }).put({ id: 'f1', note: 'written by a newer build' })
  }
  ;(await request(open)).close()
}

describe('an older build opening a database a newer build has upgraded', () => {
  it('opens, keeps every row and the store it does not know about, and keeps working', async () => {
    await initDb()
    await db.workouts.put(
      workout({
        id: 'w1',
        name: 'Legs',
        exercises: [logged('squat-barbell', [set({ weight: 100, reps: 5 })])],
        totalVolumeKg: 500,
        totalSets: 1,
        totalReps: 5,
      }),
    )
    const before = await buildBackup()
    await upgradeLikeAFutureBuild()

    await db.open()
    await initDb()

    const after = await buildBackup()
    expect({ ...after, exportedAt: 0 }).toEqual({ ...before, exportedAt: 0 })

    // Indexes still answer, and the old build can still write.
    expect((await db.workouts.where('exerciseIds').equals('squat-barbell').toArray()).map((w) => w.id)).toEqual(['w1'])
    await db.workouts.put(workout({ id: 'w2', name: 'Pull' }))
    expect(await db.workouts.count()).toBe(2)

    // The newer build's own data is left exactly as it was.
    db.close()
    const raw = await request(indexedDB.open('trana'))
    expect(await request(raw.transaction('futureStore').objectStore('futureStore').getAll())).toEqual([
      { id: 'f1', note: 'written by a newer build' },
    ])
    raw.close()
  })
})
