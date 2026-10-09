/**
 * Row-level checks for a backup file.
 *
 * `assertBackup` used to look only at the top-level shape (a version and four
 * arrays). A file with those but rubbish rows would pass, replace the user's
 * whole history, and then crash the screens that read it. This checks the
 * fields the app dereferences without a fallback, so such a file is refused
 * before anything is written.
 *
 * Deliberately not strict about everything: extra fields are ignored, and
 * fields that older builds never wrote (or that are optional in the types) are
 * not required, so every backup already taken still restores.
 */

type Row = Record<string, unknown>

const EXERCISE_KINDS = new Set([
  'weight_reps',
  'bodyweight_reps',
  'weighted_bodyweight',
  'assisted_bodyweight',
  'duration',
  'duration_weight',
  'distance_duration',
  'reps_only',
])
const SET_TYPES = new Set(['normal', 'warmup', 'drop', 'failure'])
const WORKOUT_STATUSES = new Set(['active', 'done'])

/** Enough to name the problem without printing hundreds of lines. */
const MAX_PROBLEMS = 5

const isRow = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
/** A numeric field that may be blank: absent, null or a number. */
const isNumberOrBlank = (v: unknown): boolean => v === undefined || v === null || isFiniteNumber(v)

class Problems {
  readonly list: string[] = []
  get full() {
    return this.list.length >= MAX_PROBLEMS
  }
  add(path: string, expected: string) {
    if (!this.full) this.list.push(`${path} should be ${expected}`)
  }
}

function eachRow(items: unknown[], name: string, p: Problems, check: (row: Row, path: string) => void) {
  for (let i = 0; i < items.length && !p.full; i++) {
    const path = `${name}[${i}]`
    const row = items[i]
    if (!isRow(row)) p.add(path, 'an object')
    else check(row, path)
  }
}

/** Logged sets carry an id; a routine's set targets do not. */
function checkSet(s: Row, path: string, p: Problems, hasId: boolean) {
  if (hasId && !isString(s.id)) p.add(`${path}.id`, 'text')
  for (const key of ['weight', 'reps', 'durationSec', 'distanceM', 'rpe'] as const) {
    if (!isNumberOrBlank(s[key])) p.add(`${path}.${key}`, 'a number or empty')
  }
  if (s.setType !== undefined && !SET_TYPES.has(s.setType as string)) p.add(`${path}.setType`, 'a known set type')
}

function checkExerciseList(list: unknown, path: string, p: Problems, setsHaveIds: boolean) {
  if (!Array.isArray(list)) return p.add(path, 'a list')
  eachRow(list, path, p, (ex, exPath) => {
    if (!isString(ex.exerciseId)) p.add(`${exPath}.exerciseId`, 'text')
    if (!Array.isArray(ex.sets)) return p.add(`${exPath}.sets`, 'a list')
    eachRow(ex.sets, `${exPath}.sets`, p, (s, sPath) => checkSet(s, sPath, p, setsHaveIds))
  })
}

/** Returns what is wrong with the backup's rows, or an empty list if it is usable. */
export function findBackupProblems(b: {
  exercises: unknown[]
  workouts: unknown[]
  routines: unknown[]
  folders: unknown[]
  measurements?: unknown
  settings?: unknown
}): string[] {
  const p = new Problems()

  eachRow(b.exercises, 'exercises', p, (e, path) => {
    if (!isString(e.id)) p.add(`${path}.id`, 'text')
    if (!isString(e.name)) p.add(`${path}.name`, 'text')
    if (!isString(e.muscleGroup)) p.add(`${path}.muscleGroup`, 'text')
    if (!EXERCISE_KINDS.has(e.kind as string)) p.add(`${path}.kind`, 'a known exercise type')
  })

  eachRow(b.workouts, 'workouts', p, (w, path) => {
    if (!isString(w.id)) p.add(`${path}.id`, 'text')
    if (!isFiniteNumber(w.startedAt)) p.add(`${path}.startedAt`, 'a timestamp')
    if (!WORKOUT_STATUSES.has(w.status as string)) p.add(`${path}.status`, '"active" or "done"')
    if (!isNumberOrBlank(w.finishedAt)) p.add(`${path}.finishedAt`, 'a timestamp or empty')
    if (!Array.isArray(w.exerciseIds)) p.add(`${path}.exerciseIds`, 'a list')
    checkExerciseList(w.exercises, `${path}.exercises`, p, true)
  })

  eachRow(b.routines, 'routines', p, (r, path) => {
    if (!isString(r.id)) p.add(`${path}.id`, 'text')
    if (typeof r.name !== 'string') p.add(`${path}.name`, 'text')
    checkExerciseList(r.exercises, `${path}.exercises`, p, false)
  })

  eachRow(b.folders, 'folders', p, (f, path) => {
    if (!isString(f.id)) p.add(`${path}.id`, 'text')
    if (typeof f.name !== 'string') p.add(`${path}.name`, 'text')
  })

  if (b.measurements !== undefined) {
    if (!Array.isArray(b.measurements)) p.add('measurements', 'a list')
    else {
      eachRow(b.measurements, 'measurements', p, (m, path) => {
        if (!isString(m.id)) p.add(`${path}.id`, 'text')
        if (!isString(m.type)) p.add(`${path}.type`, 'text')
        if (!isFiniteNumber(m.value)) p.add(`${path}.value`, 'a number')
        if (!isFiniteNumber(m.takenAt)) p.add(`${path}.takenAt`, 'a timestamp')
      })
    }
  }

  if (b.settings !== undefined && b.settings !== null && !isRow(b.settings)) p.add('settings', 'an object')

  return p.list
}
