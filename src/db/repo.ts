import { db } from './db'
import type { Exercise, Folder, Measurement, Routine, Settings, Workout } from './types'

/**
 * The questions and changes the screens make of the database, by name.
 *
 * Screens and components import from here rather than touching `db` (a lint
 * rule enforces it), so what a screen is allowed to do to stored data is
 * visible in one place, and a storage detail such as an index or a transaction
 * is written once rather than re-derived in every page. Wrap the reads in
 * `useLiveQuery` for a live view; the writes are plain async calls.
 *
 * Reads that Dexie answers with `undefined` for "no such row" keep doing so.
 */

// ── Reads ────────────────────────────────────────────────────────────────

export const listExercises = (): Promise<Exercise[]> => db.exercises.toArray()
export const getExercise = (id: string): Promise<Exercise | undefined> => db.exercises.get(id)
export const countExercises = (): Promise<number> => db.exercises.count()

/** The first exercise other than `exceptId` that already uses this name, ignoring case. */
export const findExerciseNameClash = (name: string, exceptId?: string): Promise<Exercise | undefined> => {
  const wanted = name.toLowerCase()
  return db.exercises.filter((e) => e.id !== exceptId && e.name.toLowerCase() === wanted).first()
}

export const getWorkout = (id: string): Promise<Workout | undefined> => db.workouts.get(id)
export const listDoneWorkouts = (): Promise<Workout[]> => db.workouts.where('status').equals('done').toArray()
export const listDoneWorkoutsNewestFirst = (): Promise<Workout[]> =>
  db.workouts.where('status').equals('done').reverse().sortBy('startedAt')
export const countDoneWorkouts = (): Promise<number> => db.workouts.where('status').equals('done').count()
export const findActiveWorkout = (): Promise<Workout | undefined> =>
  db.workouts.where('status').equals('active').first()

export const listRoutines = (): Promise<Routine[]> => db.routines.toArray()
export const getRoutine = (id: string): Promise<Routine | undefined> => db.routines.get(id)
export const countRoutines = (): Promise<number> => db.routines.count()

/** The settings row, or undefined until the database has answered. */
export const getSettings = (): Promise<Settings | undefined> => db.settings.get(1)

export const listFolders = (): Promise<Folder[]> => db.folders.toArray()
export const listMeasurements = (): Promise<Measurement[]> => db.measurements.toArray()

// ── Changes ──────────────────────────────────────────────────────────────

export const saveExercise = (exercise: Exercise): Promise<string> => db.exercises.put(exercise)
export const deleteExercise = (id: string): Promise<void> => db.exercises.delete(id)

export const saveWorkout = (workout: Workout): Promise<string> => db.workouts.put(workout)
export const deleteWorkout = (id: string): Promise<void> => db.workouts.delete(id)

export const saveRoutine = (routine: Routine): Promise<string> => db.routines.put(routine)
export const deleteRoutine = (id: string): Promise<void> => db.routines.delete(id)

export const createFolder = (folder: Folder): Promise<string> => db.folders.add(folder)

/** Removes the folder only; its routines are kept and become unfiled. */
export function deleteFolder(id: string): Promise<void> {
  return db.transaction('rw', db.routines, db.folders, async () => {
    await db.routines.where('folderId').equals(id).modify({ folderId: null })
    await db.folders.delete(id)
  })
}

export const saveMeasurement = (measurement: Measurement): Promise<string> => db.measurements.put(measurement)
export const deleteMeasurement = (id: string): Promise<void> => db.measurements.delete(id)

/** Last resort from the startup recovery screen: removes the whole local database. */
export async function eraseLocalDatabase(): Promise<void> {
  db.close()
  await db.delete()
}
