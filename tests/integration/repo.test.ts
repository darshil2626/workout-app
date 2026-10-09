import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/db/db'
import {
  countDoneWorkouts,
  createFolder,
  deleteFolder,
  findActiveWorkout,
  findExerciseNameClash,
  listDoneWorkoutsNewestFirst,
  saveExercise,
  saveRoutine,
  saveWorkout,
} from '../../src/db/repo'
import { customExercise, resetDb, workout } from './helpers'
import type { Routine } from '../../src/db/types'

beforeEach(resetDb)

const routine = (id: string, folderId: string | null): Routine => ({
  id,
  name: id,
  folderId,
  exercises: [],
  order: 0,
  createdAt: 1,
  updatedAt: 1,
})

describe('deleteFolder', () => {
  it('removes the folder and unfiles its routines, leaving others alone', async () => {
    await createFolder({ id: 'f1', name: 'A', order: 0, createdAt: 1 })
    await createFolder({ id: 'f2', name: 'B', order: 1, createdAt: 2 })
    await saveRoutine(routine('in-a', 'f1'))
    await saveRoutine(routine('in-b', 'f2'))

    await deleteFolder('f1')

    expect((await db.folders.toArray()).map((f) => f.id)).toEqual(['f2'])
    expect((await db.routines.get('in-a'))?.folderId).toBeNull()
    expect((await db.routines.get('in-b'))?.folderId).toBe('f2')
  })
})

describe('findExerciseNameClash', () => {
  it('matches ignoring case, and ignores the exercise being edited', async () => {
    await saveExercise(customExercise({ id: 'a', name: 'Zercher Squat' }))
    expect((await findExerciseNameClash('zercher SQUAT'))?.id).toBe('a')
    expect(await findExerciseNameClash('zercher squat', 'a')).toBeUndefined()
    expect(await findExerciseNameClash('Something else')).toBeUndefined()
  })
})

describe('workout queries', () => {
  it('counts and lists only finished sessions, newest first, and finds the active one', async () => {
    await saveWorkout(workout({ id: 'old', startedAt: 1000 }))
    await saveWorkout(workout({ id: 'new', startedAt: 3000 }))
    await saveWorkout(workout({ id: 'live', startedAt: 5000, status: 'active', finishedAt: null }))

    expect(await countDoneWorkouts()).toBe(2)
    expect((await listDoneWorkoutsNewestFirst()).map((w) => w.id)).toEqual(['new', 'old'])
    expect((await findActiveWorkout())?.id).toBe('live')
  })
})
