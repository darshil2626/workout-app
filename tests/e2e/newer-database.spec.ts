import { test, expect, waitForApp, readStore, openTab } from './helpers/fixtures'

// The same promise as tests/integration/newerDatabase.test.ts, but against Chromium's
// own IndexedDB rather than fake-indexeddb: an older build that meets a database a
// newer build has upgraded must open it, show the history and leave it intact.
test('a database upgraded by a newer build still opens and nothing in it is lost', async ({ page }) => {
  // Any same-origin page that runs no app code, so the database can be built first.
  await page.goto('/icon-192.png')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('trana', 900)
        open.onupgradeneeded = () => {
          const d = open.result
          const workouts = d.createObjectStore('workouts', { keyPath: 'id' })
          workouts.createIndex('status', 'status')
          workouts.createIndex('startedAt', 'startedAt')
          workouts.createIndex('finishedAt', 'finishedAt')
          workouts.createIndex('routineId', 'routineId')
          workouts.createIndex('exerciseIds', 'exerciseIds', { multiEntry: true })
          workouts.put({
            id: 'from-the-future',
            name: 'Legs from a newer build',
            status: 'done',
            startedAt: Date.now() - 3_600_000,
            finishedAt: Date.now() - 1_800_000,
            pausedSec: 0,
            exercises: [
              {
                id: 'le1',
                exerciseId: 'squat-barbell',
                supersetGroup: null,
                sets: [
                  {
                    id: 's1',
                    weight: 100,
                    reps: 5,
                    durationSec: null,
                    distanceM: null,
                    rpe: null,
                    setType: 'normal',
                    completed: true,
                  },
                ],
              },
            ],
            exerciseIds: ['squat-barbell'],
            totalVolumeKg: 500,
            totalSets: 1,
            totalReps: 5,
          })
          d.createObjectStore('futureStore', { keyPath: 'id' }).put({ id: 'f1', note: 'written by a newer build' })
        }
        open.onsuccess = () => {
          open.result.close()
          resolve()
        }
        open.onerror = () => reject(open.error)
      }),
  )

  await page.goto('/')
  await waitForApp(page)
  await expect(page.getByRole('alert')).toHaveCount(0)

  await openTab(page, 'History')
  await expect(page.getByText('Legs from a newer build')).toBeVisible()

  expect((await readStore(page, 'workouts')).map((w) => w.id)).toEqual(['from-the-future'])
  expect(await readStore(page, 'futureStore')).toEqual([{ id: 'f1', note: 'written by a newer build' }])
})
