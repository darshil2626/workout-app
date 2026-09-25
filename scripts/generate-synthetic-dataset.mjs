// Generates a synthetic IronLog backup (.json) meant to stress-test the app:
// a big custom-exercise set, folders, long/superset/empty routines, ~9 months
// of realistic progressive workout history across several training phases,
// and multi-type body measurements.
//
// Run with: node --experimental-strip-types scripts/generate-synthetic-dataset.mjs
// Output: written to the path in OUT_PATH below.
//
// This does NOT touch any database. It only writes a JSON file in the shape
// `BackupFile` expects (src/lib/backup.ts), for import via
// Settings -> Import backup or CSV. Importing REPLACES every workout,
// routine, folder, exercise and measurement already on the device.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SEED_EXERCISES, slugify } from '../src/db/seed.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Dev-only fixture, dynamically imported (and DEV-gated) by src/dev/seedSynthetic.ts
// so it never reaches a production build.
const OUT_PATH = join(ROOT, 'src', 'dev', 'synthetic-dataset.json')

const newId = () => randomUUID()

// ── Deterministic RNG (mulberry32) so re-running produces the same file ────
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = mulberry32(20260101)
const rand = () => rng()
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min
const randFloat = (min, max) => min + rand() * (max - min)
const choice = (arr) => arr[randInt(0, arr.length - 1)]
const chance = (p) => rand() < p
const roundTo = (v, step) => Math.round(v / step) * step
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t))
const DAY_MS = 86400000

// ── Exercise library ────────────────────────────────────────────────────
const byName = new Map(SEED_EXERCISES.map((e) => [e.name, e]))
function ex(name) {
  const e = byName.get(name)
  if (!e) throw new Error(`Unknown seed exercise: "${name}"`)
  return e
}

// Two seeded rows get user-authored edits, to exercise those code paths:
// a persistent note + userEdited flag, and an archived-but-still-referenced row.
const squat = { ...ex('Squat (Barbell)') }
squat.notes = 'Chest up, knees track over toes, pause 1s in the hole.'
squat.userEdited = true
const goodMorning = { ...ex('Good Morning') }
goodMorning.archived = true

const CUSTOM_EXERCISES = [
  {
    id: slugify('Band Pull Apart'),
    name: 'Band Pull Apart',
    muscleGroup: 'Shoulders',
    secondaryMuscles: ['Back'],
    equipment: 'Band',
    kind: 'weight_reps',
    isCustom: true,
    createdAt: 0,
  },
  {
    id: slugify('Ring Dips'),
    name: 'Ring Dips',
    muscleGroup: 'Chest',
    secondaryMuscles: ['Shoulders', 'Triceps'],
    equipment: 'Bodyweight',
    kind: 'weighted_bodyweight',
    isCustom: true,
    createdAt: 0,
  },
  {
    id: slugify('Prowler Sprint'),
    name: 'Prowler Sprint',
    muscleGroup: 'Full Body',
    secondaryMuscles: ['Quadriceps', 'Glutes'],
    equipment: 'Machine',
    kind: 'distance_duration',
    isCustom: true,
    createdAt: 0,
  },
  {
    id: slugify('Tire Flip'),
    name: 'Tire Flip',
    muscleGroup: 'Full Body',
    secondaryMuscles: ['Back', 'Quadriceps'],
    equipment: 'Other',
    kind: 'reps_only',
    isCustom: true,
    createdAt: 0,
  },
  {
    id: slugify('Landmine Squat'),
    name: 'Landmine Squat',
    muscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Barbell',
    kind: 'weight_reps',
    isCustom: true,
    createdAt: 0,
  },
  {
    id: slugify('Bulgarian Split Squat (Custom Tempo)'),
    name: 'Bulgarian Split Squat (Custom Tempo)',
    muscleGroup: 'Quadriceps',
    secondaryMuscles: ['Glutes', 'Hamstrings'],
    equipment: 'Dumbbell',
    kind: 'weight_reps',
    isCustom: true,
    notes: '3-1-1 tempo, pause at the bottom.',
    createdAt: 0,
  },
  {
    id: slugify('Couch Stretch'),
    name: 'Couch Stretch',
    muscleGroup: 'Other',
    equipment: 'Bodyweight',
    kind: 'duration',
    isCustom: true,
    createdAt: 0,
  },
  {
    id: slugify('1000m Row Sprint'),
    name: '1000m Row Sprint',
    muscleGroup: 'Cardio',
    equipment: 'Machine',
    kind: 'distance_duration',
    isCustom: true,
    archived: true,
    createdAt: 0,
  },
]

const ALL_EXERCISES = SEED_EXERCISES.map((e) =>
  e.name === 'Squat (Barbell)' ? squat : e.name === 'Good Morning' ? goodMorning : e,
).concat(CUSTOM_EXERCISES)
const exById = new Map(ALL_EXERCISES.map((e) => [e.id, e]))
function exByName(name) {
  const found = ALL_EXERCISES.find((e) => e.name === name)
  if (!found) throw new Error(`Unknown exercise: "${name}"`)
  return found
}

// ── Timeline ────────────────────────────────────────────────────────────
const END_DATE = new Date(2026, 8, 23, 12) // 2026-09-23, a couple of days before "today"
const START_DATE = new Date(2025, 11, 1, 12) // 2025-12-01
const TOTAL_DAYS = Math.round((END_DATE - START_DATE) / DAY_MS)

function weekFracAt(date) {
  return (date - START_DATE) / (END_DATE - START_DATE)
}

// ── Folders ─────────────────────────────────────────────────────────────
const folderDefs = [
  'Push Pull Legs',
  'Upper Lower',
  'Strength',
  'Cardio & Conditioning',
  'Mobility',
]
const folders = folderDefs.map((name, i) => ({
  id: newId(),
  name,
  order: i,
  createdAt: START_DATE.getTime() - DAY_MS * 3,
}))
const folderId = (name) => folders.find((f) => f.name === name).id

// ── Baselines driving realistic progression ────────────────────────────
// weightStart/End in kg (per-hand for dumbbells), repsStart/End, sets.
// durationStart/End in seconds, distanceStart/End in metres.
const BASELINES = {
  'Squat (Barbell)': { weightStart: 70, weightEnd: 120, repsStart: 5, repsEnd: 5, sets: 4, warmup: true },
  'Front Squat': { weightStart: 50, weightEnd: 80, repsStart: 6, repsEnd: 6, sets: 3 },
  'Deadlift (Barbell)': { weightStart: 90, weightEnd: 150, repsStart: 5, repsEnd: 5, sets: 3, warmup: true },
  'Rack Pull': { weightStart: 100, weightEnd: 160, repsStart: 5, repsEnd: 5, sets: 3 },
  'Bench Press (Barbell)': { weightStart: 55, weightEnd: 90, repsStart: 5, repsEnd: 5, sets: 4, warmup: true },
  'Incline Bench Press (Dumbbell)': { weightStart: 20, weightEnd: 32, repsStart: 8, repsEnd: 8, sets: 3 },
  'Decline Bench Press (Barbell)': { weightStart: 50, weightEnd: 75, repsStart: 8, repsEnd: 8, sets: 3 },
  'Overhead Press (Barbell)': { weightStart: 35, weightEnd: 55, repsStart: 6, repsEnd: 6, sets: 3, warmup: true },
  'Overhead Press (Dumbbell)': { weightStart: 16, weightEnd: 26, repsStart: 8, repsEnd: 8, sets: 3 },
  'Arnold Press': { weightStart: 14, weightEnd: 22, repsStart: 10, repsEnd: 10, sets: 3 },
  'Bent Over Row (Barbell)': { weightStart: 50, weightEnd: 85, repsStart: 8, repsEnd: 8, sets: 3 },
  'Seated Cable Row': { weightStart: 45, weightEnd: 70, repsStart: 10, repsEnd: 10, sets: 3 },
  'Close Grip Bench Press': { weightStart: 40, weightEnd: 62, repsStart: 8, repsEnd: 8, sets: 3 },
  'Lateral Raise (Dumbbell)': { weightStart: 8, weightEnd: 13, repsStart: 12, repsEnd: 12, sets: 3 },
  'Rear Delt Fly (Dumbbell)': { weightStart: 8, weightEnd: 12, repsStart: 12, repsEnd: 12, sets: 3 },
  'Triceps Pushdown (Cable)': { weightStart: 20, weightEnd: 35, repsStart: 12, repsEnd: 12, sets: 3 },
  'Rope Pushdown': { weightStart: 18, weightEnd: 30, repsStart: 12, repsEnd: 12, sets: 3 },
  'Bicep Curl (Dumbbell)': { weightStart: 10, weightEnd: 16, repsStart: 10, repsEnd: 10, sets: 3 },
  'Hammer Curl': { weightStart: 10, weightEnd: 16, repsStart: 10, repsEnd: 10, sets: 3 },
  'Bicep Curl (Barbell)': { weightStart: 20, weightEnd: 32, repsStart: 10, repsEnd: 10, sets: 3 },
  'Preacher Curl': { weightStart: 15, weightEnd: 25, repsStart: 10, repsEnd: 10, sets: 3 },
  'Skullcrusher (EZ Bar)': { weightStart: 15, weightEnd: 25, repsStart: 10, repsEnd: 10, sets: 3 },
  'Overhead Triceps Extension (Cable)': { weightStart: 15, weightEnd: 25, repsStart: 12, repsEnd: 12, sets: 3 },
  'Lat Pulldown (Cable)': { weightStart: 45, weightEnd: 70, repsStart: 10, repsEnd: 10, sets: 3 },
  'Lat Pulldown - Wide Grip': { weightStart: 45, weightEnd: 68, repsStart: 10, repsEnd: 10, sets: 3 },
  'Face Pull': { weightStart: 15, weightEnd: 25, repsStart: 15, repsEnd: 15, sets: 3 },
  'Cable Crossover': { weightStart: 10, weightEnd: 18, repsStart: 12, repsEnd: 12, sets: 3 },
  'Front Raise (Cable)': { weightStart: 8, weightEnd: 14, repsStart: 12, repsEnd: 12, sets: 3 },
  'Leg Press': { weightStart: 80, weightEnd: 160, repsStart: 10, repsEnd: 10, sets: 3 },
  'Leg Extension': { weightStart: 30, weightEnd: 55, repsStart: 12, repsEnd: 12, sets: 3 },
  'Lying Leg Curl': { weightStart: 25, weightEnd: 45, repsStart: 12, repsEnd: 12, sets: 3 },
  'Seated Leg Curl': { weightStart: 25, weightEnd: 45, repsStart: 12, repsEnd: 12, sets: 3 },
  'Standing Calf Raise (Machine)': { weightStart: 40, weightEnd: 70, repsStart: 15, repsEnd: 15, sets: 3 },
  'Seated Calf Raise (Machine)': { weightStart: 30, weightEnd: 50, repsStart: 15, repsEnd: 15, sets: 3 },
  'Romanian Deadlift (Barbell)': { weightStart: 50, weightEnd: 90, repsStart: 8, repsEnd: 8, sets: 3 },
  'Romanian Deadlift (Dumbbell)': { weightStart: 18, weightEnd: 28, repsStart: 10, repsEnd: 10, sets: 3 },
  'Good Morning': { weightStart: 30, weightEnd: 40, repsStart: 8, repsEnd: 8, sets: 3 },
  'Hip Thrust (Barbell)': { weightStart: 60, weightEnd: 110, repsStart: 8, repsEnd: 8, sets: 3 },
  'Bulgarian Split Squat': { weightStart: 12, weightEnd: 20, repsStart: 10, repsEnd: 10, sets: 3 },
  'Walking Lunge': { weightStart: 10, weightEnd: 18, repsStart: 10, repsEnd: 10, sets: 3 },
  'Russian Twist': { weightStart: 5, weightEnd: 10, repsStart: 15, repsEnd: 15, sets: 3 },
  'Cable Crunch': { weightStart: 25, weightEnd: 45, repsStart: 12, repsEnd: 12, sets: 3 },
  'Landmine Squat': { weightStart: 20, weightEnd: 40, repsStart: 8, repsEnd: 8, sets: 3 },
  'Bulgarian Split Squat (Custom Tempo)': { weightStart: 10, weightEnd: 16, repsStart: 8, repsEnd: 8, sets: 3 },
  'Band Pull Apart': { weightStart: 5, weightEnd: 8, repsStart: 15, repsEnd: 15, sets: 3 },
  'Kettlebell Swing': { weightStart: 12, weightEnd: 20, repsStart: 15, repsEnd: 15, sets: 3 },

  // Bodyweight-kind: weightStart/End is added (or assisted) load.
  'Pull Up': { weightStart: 0, weightEnd: 15, repsStart: 6, repsEnd: 10, sets: 3 },
  'Chin Up': { weightStart: 0, weightEnd: 12, repsStart: 6, repsEnd: 9, sets: 3 },
  'Assisted Pull Up': { weightStart: -35, weightEnd: -15, repsStart: 6, repsEnd: 10, sets: 3 },
  'Air Squat': { repsStart: 15, repsEnd: 30, sets: 3 },
  'Ring Dips': { weightStart: 0, weightEnd: 10, repsStart: 6, repsEnd: 10, sets: 3 },
  Burpee: { repsStart: 8, repsEnd: 15, sets: 3 },
  'Hanging Leg Raise': { repsStart: 5, repsEnd: 12, sets: 3 },
  'Box Jump': { repsStart: 5, repsEnd: 10, sets: 3 },
  'Tire Flip': { repsStart: 4, repsEnd: 8, sets: 3 },

  // Duration-kind (non-cardio): durationStart/End in seconds.
  Plank: { durationStart: 30, durationEnd: 90, sets: 3 },
  'Couch Stretch': { durationStart: 60, durationEnd: 90, sets: 2 },
  'Battle Ropes': { durationStart: 30, durationEnd: 60, sets: 3 },
  'Jump Rope': { durationStart: 120, durationEnd: 300, sets: 3 },
  Stretching: { durationStart: 600, durationEnd: 900, sets: 1 },
  'Foam Rolling': { durationStart: 300, durationEnd: 600, sets: 1 },
  Yoga: { durationStart: 1800, durationEnd: 3600, sets: 1 },

  // duration_weight: weight + duration together.
  'Farmers Walk': { weightStart: 20, weightEnd: 35, durationStart: 30, durationEnd: 45, sets: 3 },

  // distance_duration: distance + duration together (pace improves slightly).
  'Running (Outdoor)': { distanceStart: 3000, distanceEnd: 8000, paceStart: 390, paceEnd: 330, sets: 1 },
  'Rowing Machine': { distanceStart: 1500, distanceEnd: 3000, paceStart: 135, paceEnd: 120, sets: 1 },
  'Assault Bike': { distanceStart: 3000, distanceEnd: 6000, paceStart: 150, paceEnd: 130, sets: 1 },
  'Prowler Sprint': { distanceStart: 20, distanceEnd: 40, paceStart: 1, paceEnd: 0.75, sets: 4 },
  '1000m Row Sprint': { distanceStart: 1000, distanceEnd: 1000, paceStart: 240, paceEnd: 210, sets: 1 },
}

function baselineFor(name) {
  const b = BASELINES[name]
  if (!b) throw new Error(`No baseline for "${name}"`)
  return b
}

function buildSet({ weight = null, reps = null, durationSec = null, distanceM = null, rpe = null, setType = 'normal' }) {
  return { id: newId(), weight, reps, durationSec, distanceM, rpe, setType, completed: true }
}

function maybeRpe(hard = false) {
  if (chance(0.35)) return null
  const base = hard ? randFloat(7.5, 9.5) : randFloat(6, 8.5)
  return roundTo(base, 0.5)
}

/** Deload every 6th training week; a rare PR spike on an otherwise normal week. */
function weekModifiers(weekFrac) {
  const weekNumber = Math.floor(weekFrac * (TOTAL_DAYS / 7))
  const deload = weekNumber > 0 && weekNumber % 6 === 5
  const prAttempt = !deload && chance(0.06)
  return { deload, prAttempt }
}

function logExercise(name, weekFrac, { supersetGroup = null, restSeconds = null } = {}) {
  const exercise = exByName(name)
  const baseline = baselineFor(name)
  const kind = exercise.kind
  const { deload, prAttempt } = weekModifiers(weekFrac)
  const sets = []
  const setCount = Math.max(1, baseline.sets + (chance(0.15) ? choice([-1, 1]) : 0))

  const noise = () => randFloat(-0.04, 0.04)

  if (kind === 'weight_reps' || kind === 'weighted_bodyweight' || kind === 'assisted_bodyweight') {
    let w = lerp(baseline.weightStart, baseline.weightEnd, weekFrac) * (1 + noise())
    if (deload) w *= 0.9
    if (prAttempt) w *= 1.05
    const step = kind === 'weight_reps' && Math.abs(baseline.weightEnd) >= 40 ? 2.5 : 1.25
    w = roundTo(w, step)
    const reps = Math.round(lerp(baseline.repsStart, baseline.repsEnd, weekFrac))

    if (baseline.warmup && kind === 'weight_reps') {
      sets.push(buildSet({ weight: roundTo(w * 0.5, step), reps: 8, setType: 'warmup', rpe: null }))
      sets.push(buildSet({ weight: roundTo(w * 0.75, step), reps: 4, setType: 'warmup', rpe: null }))
    }
    for (let i = 0; i < setCount; i++) {
      const isLast = i === setCount - 1
      const setType = isLast && chance(0.12) ? choice(['drop', 'failure']) : 'normal'
      const repVar = isLast && setType !== 'normal' ? Math.max(1, reps - randInt(0, 2)) : reps
      sets.push(buildSet({ weight: w, reps: repVar, setType, rpe: maybeRpe(isLast) }))
    }
  } else if (kind === 'bodyweight_reps' || kind === 'reps_only') {
    const reps = Math.round(lerp(baseline.repsStart, baseline.repsEnd, weekFrac) * (1 + noise()))
    for (let i = 0; i < setCount; i++) {
      sets.push(buildSet({ reps: Math.max(1, reps - i), setType: 'normal', rpe: maybeRpe(i === setCount - 1) }))
    }
  } else if (kind === 'duration') {
    let dur = lerp(baseline.durationStart, baseline.durationEnd, weekFrac) * (1 + noise())
    if (deload) dur *= 0.9
    dur = Math.round(dur)
    for (let i = 0; i < setCount; i++) {
      sets.push(buildSet({ durationSec: Math.max(10, dur - i * 3), setType: 'normal', rpe: maybeRpe(false) }))
    }
  } else if (kind === 'duration_weight') {
    let w = lerp(baseline.weightStart, baseline.weightEnd, weekFrac) * (1 + noise())
    w = roundTo(w, 1.25)
    const dur = Math.round(lerp(baseline.durationStart, baseline.durationEnd, weekFrac))
    for (let i = 0; i < setCount; i++) {
      sets.push(buildSet({ weight: w, durationSec: dur, setType: 'normal', rpe: maybeRpe(false) }))
    }
  } else if (kind === 'distance_duration') {
    const dist = Math.round(lerp(baseline.distanceStart, baseline.distanceEnd, weekFrac) * (1 + noise()))
    const pace = lerp(baseline.paceStart, baseline.paceEnd, weekFrac)
    for (let i = 0; i < setCount; i++) {
      const setDist = setCount > 1 ? Math.round(dist / setCount) : dist
      sets.push(buildSet({ distanceM: setDist, durationSec: Math.round(setDist * pace) || Math.round(pace), setType: 'normal', rpe: maybeRpe(true) }))
    }
  }

  return { id: newId(), exerciseId: exercise.id, supersetGroup, restSeconds, sets }
}

// ── Routine templates ───────────────────────────────────────────────────
function mkRoutineExercise(name, { sets = 3, supersetGroup = null, restSeconds = null, warmupFirst = false } = {}) {
  const exercise = exByName(name)
  const baseline = BASELINES[name] ?? {}
  const kind = exercise.kind
  const targets = []
  const targetReps = baseline.repsStart ?? null
  if (warmupFirst) targets.push({ weight: null, reps: 8, durationSec: null, distanceM: null, setType: 'warmup' })
  for (let i = 0; i < sets; i++) {
    if (kind === 'duration') {
      targets.push({ weight: null, reps: null, durationSec: baseline.durationStart ?? 45, distanceM: null, setType: 'normal' })
    } else if (kind === 'duration_weight') {
      targets.push({ weight: baseline.weightStart ?? null, reps: null, durationSec: baseline.durationStart ?? 30, distanceM: null, setType: 'normal' })
    } else if (kind === 'distance_duration') {
      targets.push({ weight: null, reps: null, durationSec: null, distanceM: baseline.distanceStart ?? 1000, setType: 'normal' })
    } else {
      targets.push({ weight: null, reps: targetReps, durationSec: null, distanceM: null, setType: 'normal' })
    }
  }
  return { id: newId(), exerciseId: exercise.id, supersetGroup, restSeconds: restSeconds ?? undefined, sets: targets }
}

function mkRoutine(name, folder, exerciseSpecs, createdAt) {
  return {
    id: newId(),
    name,
    folderId: folder ? folderId(folder) : null,
    exercises: exerciseSpecs.map((spec) => mkRoutineExercise(spec.name, spec)),
    order: 0, // reassigned below, per folder/loose group
    createdAt,
    updatedAt: createdAt,
    lastPerformedAt: null, // filled in once workout history is generated
  }
}

const routineCreatedAt = START_DATE.getTime() - DAY_MS * 2

const ROUTINES = [
  // ── Push Pull Legs ──────────────────────────────────────────────────
  mkRoutine('Push Day A', 'Push Pull Legs', [
    { name: 'Bench Press (Barbell)', sets: 4 },
    { name: 'Overhead Press (Barbell)', sets: 3 },
    { name: 'Incline Bench Press (Dumbbell)', sets: 3 },
    { name: 'Lateral Raise (Dumbbell)', sets: 3, supersetGroup: 1 },
    { name: 'Rear Delt Fly (Dumbbell)', sets: 3, supersetGroup: 1 },
    { name: 'Triceps Pushdown (Cable)', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Pull Day A', 'Push Pull Legs', [
    { name: 'Deadlift (Barbell)', sets: 3, restSeconds: 180 },
    { name: 'Pull Up', sets: 3 },
    { name: 'Bent Over Row (Barbell)', sets: 3 },
    { name: 'Lat Pulldown (Cable)', sets: 3 },
    { name: 'Bicep Curl (Dumbbell)', sets: 3, supersetGroup: 1 },
    { name: 'Hammer Curl', sets: 3, supersetGroup: 1 },
  ], routineCreatedAt),
  mkRoutine('Leg Day A', 'Push Pull Legs', [
    { name: 'Squat (Barbell)', sets: 4, restSeconds: 180 },
    { name: 'Romanian Deadlift (Barbell)', sets: 3 },
    { name: 'Leg Press', sets: 3 },
    { name: 'Leg Extension', sets: 3 },
    { name: 'Lying Leg Curl', sets: 3 },
    { name: 'Standing Calf Raise (Machine)', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Push Day B', 'Push Pull Legs', [
    { name: 'Overhead Press (Dumbbell)', sets: 3 },
    { name: 'Decline Bench Press (Barbell)', sets: 3 },
    { name: 'Cable Crossover', sets: 3 },
    { name: 'Front Raise (Cable)', sets: 3 },
    { name: 'Skullcrusher (EZ Bar)', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Pull Day B', 'Push Pull Legs', [
    { name: 'Rack Pull', sets: 3, restSeconds: 180 },
    { name: 'Seated Cable Row', sets: 3 },
    { name: 'Chin Up', sets: 3 },
    { name: 'Face Pull', sets: 3 },
    { name: 'Preacher Curl', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Leg Day B', 'Push Pull Legs', [
    { name: 'Front Squat', sets: 3, restSeconds: 150 },
    { name: 'Bulgarian Split Squat', sets: 3 },
    { name: 'Hip Thrust (Barbell)', sets: 3 },
    { name: 'Seated Leg Curl', sets: 3 },
    { name: 'Seated Calf Raise (Machine)', sets: 3 },
  ], routineCreatedAt),

  // ── Upper Lower ─────────────────────────────────────────────────────
  mkRoutine('Upper A', 'Upper Lower', [
    { name: 'Bench Press (Barbell)', sets: 4 },
    { name: 'Bent Over Row (Barbell)', sets: 3 },
    { name: 'Overhead Press (Dumbbell)', sets: 3 },
    { name: 'Lat Pulldown (Cable)', sets: 3 },
    { name: 'Bicep Curl (Barbell)', sets: 3 },
    { name: 'Triceps Pushdown (Cable)', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Lower A', 'Upper Lower', [
    { name: 'Squat (Barbell)', sets: 4, restSeconds: 180 },
    { name: 'Romanian Deadlift (Dumbbell)', sets: 3 },
    { name: 'Leg Press', sets: 3 },
    { name: 'Standing Calf Raise (Machine)', sets: 3 },
    { name: 'Hanging Leg Raise', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Upper B', 'Upper Lower', [
    { name: 'Incline Bench Press (Dumbbell)', sets: 3 },
    { name: 'Seated Cable Row', sets: 3 },
    { name: 'Arnold Press', sets: 3 },
    { name: 'Lat Pulldown - Wide Grip', sets: 3 },
    { name: 'Hammer Curl', sets: 3 },
    { name: 'Overhead Triceps Extension (Cable)', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Lower B', 'Upper Lower', [
    { name: 'Deadlift (Barbell)', sets: 3, restSeconds: 180 },
    { name: 'Leg Extension', sets: 3 },
    { name: 'Lying Leg Curl', sets: 3 },
    { name: 'Walking Lunge', sets: 3 },
    { name: 'Seated Calf Raise (Machine)', sets: 3 },
  ], routineCreatedAt),

  // ── Strength (low exercise count, heavier top sets) ────────────────
  mkRoutine('Squat Focus', 'Strength', [
    { name: 'Squat (Barbell)', sets: 5, warmupFirst: true, restSeconds: 180 },
    { name: 'Leg Press', sets: 3 },
    { name: 'Plank', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Bench Focus', 'Strength', [
    { name: 'Bench Press (Barbell)', sets: 5, warmupFirst: true, restSeconds: 180 },
    { name: 'Close Grip Bench Press', sets: 3 },
    { name: 'Face Pull', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Deadlift Focus', 'Strength', [
    { name: 'Deadlift (Barbell)', sets: 3, warmupFirst: true, restSeconds: 210 },
    { name: 'Pull Up', sets: 3 },
    { name: 'Cable Crunch', sets: 3 },
  ], routineCreatedAt),

  // ── Cardio & Conditioning ───────────────────────────────────────────
  mkRoutine('HIIT Circuit', 'Cardio & Conditioning', [
    { name: 'Kettlebell Swing', sets: 3, supersetGroup: 1 },
    { name: 'Battle Ropes', sets: 3, supersetGroup: 1 },
    { name: 'Box Jump', sets: 3, supersetGroup: 1 },
    { name: 'Burpee', sets: 3, supersetGroup: 1 },
  ], routineCreatedAt),
  mkRoutine('Long Run', 'Cardio & Conditioning', [{ name: 'Running (Outdoor)', sets: 1 }], routineCreatedAt),
  mkRoutine('Rowing Intervals', 'Cardio & Conditioning', [
    { name: 'Rowing Machine', sets: 4 },
    { name: 'Assault Bike', sets: 2 },
  ], routineCreatedAt),

  // ── Mobility ────────────────────────────────────────────────────────
  mkRoutine('Morning Stretch', 'Mobility', [
    { name: 'Stretching', sets: 1 },
    { name: 'Foam Rolling', sets: 1 },
    { name: 'Couch Stretch', sets: 2 },
  ], routineCreatedAt),
  mkRoutine('Yoga Flow', 'Mobility', [{ name: 'Yoga', sets: 1 }], routineCreatedAt),

  // ── Loose (no folder) ───────────────────────────────────────────────
  mkRoutine('The Everything Routine', null, [
    { name: 'Bench Press (Barbell)', sets: 4 },
    { name: 'Overhead Press (Barbell)', sets: 3 },
    { name: 'Deadlift (Barbell)', sets: 3 },
    { name: 'Squat (Barbell)', sets: 4 },
    { name: 'Bent Over Row (Barbell)', sets: 3 },
    { name: 'Seated Cable Row', sets: 3 },
    { name: 'Lat Pulldown (Cable)', sets: 3 },
    { name: 'Leg Press', sets: 3 },
    { name: 'Leg Extension', sets: 3 },
    { name: 'Lying Leg Curl', sets: 3 },
    { name: 'Romanian Deadlift (Barbell)', sets: 3 },
    { name: 'Hip Thrust (Barbell)', sets: 3 },
    { name: 'Standing Calf Raise (Machine)', sets: 3 },
    { name: 'Lateral Raise (Dumbbell)', sets: 3, supersetGroup: 1 },
    { name: 'Face Pull', sets: 3, supersetGroup: 1 },
    { name: 'Bicep Curl (Dumbbell)', sets: 3, supersetGroup: 2 },
    { name: 'Hammer Curl', sets: 3, supersetGroup: 2 },
    { name: 'Triceps Pushdown (Cable)', sets: 3 },
    { name: 'Skullcrusher (EZ Bar)', sets: 3 },
    { name: 'Air Squat', sets: 3 },
    { name: 'Pull Up', sets: 3 },
    { name: 'Assisted Pull Up', sets: 3 },
    { name: 'Plank', sets: 3 },
    { name: 'Farmers Walk', sets: 3 },
    { name: 'Rowing Machine', sets: 1 },
    { name: 'Box Jump', sets: 3 },
    { name: 'Russian Twist', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Quick 15', null, [
    { name: 'Air Squat', sets: 3 },
    { name: 'Ring Dips', sets: 3 },
    { name: 'Plank', sets: 3 },
  ], routineCreatedAt),
  mkRoutine('Empty Routine Draft', null, [], routineCreatedAt),
  mkRoutine('Old PPL (Unused)', null, [
    { name: 'Landmine Squat', sets: 3 },
    { name: 'Bulgarian Split Squat (Custom Tempo)', sets: 3 },
    { name: 'Band Pull Apart', sets: 3 },
  ], routineCreatedAt),
]

// Order within each folder / the loose group, in the order defined above.
{
  const seenGroup = new Map()
  for (const r of ROUTINES) {
    const key = r.folderId ?? '__loose__'
    const n = seenGroup.get(key) ?? 0
    r.order = n
    seenGroup.set(key, n + 1)
  }
}
const routineByName = new Map(ROUTINES.map((r) => [r.name, r]))

// ── Body measurements ───────────────────────────────────────────────────
// Canonical units: kg for weight, percent for bodyFat, cm for circumferences.
const MEASUREMENT_SERIES = {
  bodyweight: { start: 85, end: 78.5, freqDays: 3.5, noise: 0.5 },
  bodyFat: { start: 22, end: 15.5, freqDays: 14, noise: 0.4 },
  neck: { start: 39, end: 38.5, freqDays: 21, noise: 0.2 },
  shoulders: { start: 112, end: 116, freqDays: 21, noise: 0.5 },
  chest: { start: 98, end: 103, freqDays: 14, noise: 0.5 },
  waist: { start: 92, end: 84, freqDays: 14, noise: 0.6 },
  hips: { start: 100, end: 97, freqDays: 21, noise: 0.5 },
  leftBicep: { start: 33, end: 36.5, freqDays: 14, noise: 0.3 },
  rightBicep: { start: 33.5, end: 37, freqDays: 14, noise: 0.3 },
  leftForearm: { start: 27, end: 28.5, freqDays: 21, noise: 0.2 },
  rightForearm: { start: 27.2, end: 28.8, freqDays: 21, noise: 0.2 },
  leftThigh: { start: 55, end: 59, freqDays: 21, noise: 0.5 },
  rightThigh: { start: 55.5, end: 59.5, freqDays: 21, noise: 0.5 },
  leftCalf: { start: 36, end: 37.5, freqDays: 21, noise: 0.3 },
  rightCalf: { start: 36.2, end: 37.8, freqDays: 21, noise: 0.3 },
}

const measurements = []
let bodyweightSamples = [] // {t, kg} for interpolation, used by workout logging
for (const [type, spec] of Object.entries(MEASUREMENT_SERIES)) {
  let t = START_DATE.getTime() + randInt(0, 4) * DAY_MS
  while (t <= END_DATE.getTime()) {
    const frac = (t - START_DATE.getTime()) / (END_DATE.getTime() - START_DATE.getTime())
    const value = roundTo(lerp(spec.start, spec.end, frac) + randFloat(-spec.noise, spec.noise), type === 'bodyFat' ? 0.1 : 0.1)
    measurements.push({ id: newId(), type, value, takenAt: t })
    if (type === 'bodyweight') bodyweightSamples.push({ t, kg: value })
    t += Math.round(spec.freqDays * DAY_MS * randFloat(0.7, 1.3))
  }
}
bodyweightSamples.sort((a, b) => a.t - b.t)

function bodyweightAt(t) {
  if (bodyweightSamples.length === 0) return 80
  if (t <= bodyweightSamples[0].t) return bodyweightSamples[0].kg
  for (let i = 1; i < bodyweightSamples.length; i++) {
    if (t <= bodyweightSamples[i].t) {
      const a = bodyweightSamples[i - 1]
      const b = bodyweightSamples[i]
      const f = (t - a.t) / (b.t - a.t)
      return roundTo(lerp(a.kg, b.kg, f), 0.1)
    }
  }
  return bodyweightSamples[bodyweightSamples.length - 1].kg
}

// ── Totals (mirrors src/lib/workout.ts effectiveWeightKg/computeTotals) ──
function effectiveWeightKg(set, kind, bodyweightKg) {
  const bw = bodyweightKg ?? 0
  switch (kind) {
    case 'weight_reps':
    case 'duration_weight':
      return set.weight ?? 0
    case 'bodyweight_reps':
    case 'reps_only':
      return bw
    case 'weighted_bodyweight':
      return bw + (set.weight ?? 0)
    case 'assisted_bodyweight':
      return Math.max(0, bw - (set.weight ?? 0))
    default:
      return 0
  }
}
function computeTotals(exercises, bodyweightKg) {
  let totalVolumeKg = 0
  let totalSets = 0
  let totalReps = 0
  for (const le of exercises) {
    const kind = exById.get(le.exerciseId)?.kind ?? 'weight_reps'
    for (const set of le.sets) {
      if (!set.completed || set.setType === 'warmup') continue
      totalSets += 1
      totalReps += set.reps ?? 0
      const w = effectiveWeightKg(set, kind, bodyweightKg)
      if (set.reps) totalVolumeKg += w * set.reps
    }
  }
  return { totalVolumeKg: Math.round(totalVolumeKg * 10) / 10, totalSets, totalReps }
}

// ── Workout history ─────────────────────────────────────────────────────
const NOTES_POOL = [
  'Felt strong today.',
  'Slept badly, everything felt heavy.',
  'Gym was packed, had to wait for the rack.',
  'New shoes, deadlift felt more stable.',
  'Left shoulder a bit tight during pressing.',
  'Great pump, energy was high all session.',
  'Cut it short, ran out of time.',
  'First session back after the break, took it easy.',
]

const workouts = []

function addWorkout({ date, routine, exerciseSpecs, hourRange }) {
  const weekFrac = weekFracAt(date)
  const hour = randInt(hourRange[0], hourRange[1])
  const minute = choice([0, 10, 15, 20, 30, 40, 45])
  const startedAt = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute).getTime()
  const loggedExercises = exerciseSpecs.map((spec) => logExercise(spec.name, weekFrac, spec))
  const bw = bodyweightAt(startedAt)
  const totals = computeTotals(loggedExercises, bw)
  const durationMin =
    loggedExercises.length <= 2
      ? randInt(20, 50)
      : randInt(45, 95)
  const finishedAt = startedAt + durationMin * 60000
  const exerciseIds = [...new Set(loggedExercises.map((le) => le.exerciseId))]

  const workout = {
    id: newId(),
    name: routine ? routine.name : defaultWorkoutName(hour),
    status: 'done',
    startedAt,
    finishedAt,
    pausedSec: chance(0.3) ? randInt(30, 240) : 0,
    routineId: routine ? routine.id : undefined,
    exercises: loggedExercises,
    exerciseIds,
    totalVolumeKg: totals.totalVolumeKg,
    totalSets: totals.totalSets,
    totalReps: totals.totalReps,
    bodyweightKg: bw,
  }
  if (chance(0.15)) workout.notes = choice(NOTES_POOL)
  if (chance(0.75)) {
    workout.effort = choice([2, 3, 3, 4, 4, 4, 5])
    workout.feeling = choice([2, 3, 4, 4, 5, 5])
  }
  workouts.push(workout)
  if (routine && (routine.lastPerformedAt == null || finishedAt > routine.lastPerformedAt)) {
    routine.lastPerformedAt = finishedAt
  }
}

function defaultWorkoutName(hour) {
  const part = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : hour < 21 ? 'Evening' : 'Night'
  return `${part} Workout`
}

// Phase schedule: weekday 0=Sun..6=Sat.
const PHASES = [
  {
    from: new Date(2025, 11, 1),
    to: new Date(2026, 1, 28),
    trainDays: [1, 2, 4, 5],
    cycle: ['Push Day A', 'Pull Day A', 'Leg Day A', 'Push Day B', 'Pull Day B', 'Leg Day B'],
    skipChance: 0.1,
  },
  {
    // injury / holiday gap: light mobility only
    from: new Date(2026, 2, 1),
    to: new Date(2026, 2, 14),
    trainDays: [3],
    cycle: ['Morning Stretch'],
    skipChance: 0.3,
  },
  {
    from: new Date(2026, 2, 15),
    to: new Date(2026, 5, 15),
    trainDays: [1, 3, 5],
    cycle: ['Upper A', 'Lower A', 'Upper B', 'Lower B'],
    skipChance: 0.1,
    extra: [{ day: 6, chance: 0.4, options: ['Long Run', 'Rowing Intervals'] }],
  },
  {
    from: new Date(2026, 5, 16),
    to: END_DATE,
    trainDays: [1, 3, 5],
    cycle: ['Squat Focus', 'Bench Focus', 'Deadlift Focus'],
    skipChance: 0.1,
    extra: [
      { day: 6, chance: 0.5, options: ['HIIT Circuit', 'Long Run'] },
      { day: 0, chance: 0.3, options: ['Yoga Flow'] },
    ],
  },
]

for (const phase of PHASES) {
  let cycleIndex = 0
  for (let t = phase.from.getTime(); t <= phase.to.getTime(); t += DAY_MS) {
    const date = new Date(t)
    const weekday = date.getDay()
    if (phase.trainDays.includes(weekday) && !chance(phase.skipChance)) {
      const routine = routineByName.get(phase.cycle[cycleIndex % phase.cycle.length])
      cycleIndex++
      addWorkout({
        date,
        routine,
        exerciseSpecs: routine.exercises.map((re) => ({
          name: exById.get(re.exerciseId).name,
          supersetGroup: re.supersetGroup,
          restSeconds: re.restSeconds ?? null,
        })),
        hourRange: weekday === 6 || weekday === 0 ? [8, 11] : [17, 20],
      })
    }
    for (const extra of phase.extra ?? []) {
      if (weekday === extra.day && chance(extra.chance)) {
        const routine = routineByName.get(choice(extra.options))
        addWorkout({
          date,
          routine,
          exerciseSpecs: routine.exercises.map((re) => ({
            name: exById.get(re.exerciseId).name,
            supersetGroup: re.supersetGroup,
            restSeconds: re.restSeconds ?? null,
          })),
          hourRange: [8, 11],
        })
      }
    }
  }
}

// A handful of ad-hoc sessions not tied to any routine.
const ADHOC_POOLS = [
  ['Bench Press (Barbell)', 'Bicep Curl (Dumbbell)', 'Triceps Pushdown (Cable)'],
  ['Squat (Barbell)', 'Leg Extension', 'Standing Calf Raise (Machine)'],
  ['Pull Up', 'Face Pull', 'Hammer Curl'],
  ['Running (Outdoor)'],
  ['Air Squat', 'Plank', 'Russian Twist'],
]
for (let i = 0; i < 6; i++) {
  const dayOffset = randInt(0, TOTAL_DAYS)
  const date = new Date(START_DATE.getTime() + dayOffset * DAY_MS)
  const weekday = date.getDay()
  if (weekday !== 2 && weekday !== 4) continue // slot into otherwise-light weekdays only
  const names = choice(ADHOC_POOLS)
  addWorkout({
    date,
    routine: null,
    exerciseSpecs: names.map((name) => ({ name, supersetGroup: null, restSeconds: null })),
    hourRange: [17, 21],
  })
}

// A couple of very old sessions logging the now-archived "Good Morning", so
// the archived-but-referenced-in-history path has real data behind it.
for (const offsetDays of [10, 45]) {
  const date = new Date(START_DATE.getTime() + offsetDays * DAY_MS)
  addWorkout({
    date,
    routine: null,
    exerciseSpecs: [
      { name: 'Good Morning', supersetGroup: null, restSeconds: null },
      { name: 'Romanian Deadlift (Barbell)', supersetGroup: null, restSeconds: null },
    ],
    hourRange: [17, 20],
  })
}

// A couple of sessions logging the archived custom cardio exercise.
for (const offsetDays of [30, 90]) {
  const date = new Date(START_DATE.getTime() + offsetDays * DAY_MS)
  addWorkout({
    date,
    routine: null,
    exerciseSpecs: [{ name: '1000m Row Sprint', supersetGroup: null, restSeconds: null }],
    hourRange: [7, 9],
  })
}

workouts.sort((a, b) => a.startedAt - b.startedAt)

// ── Settings ─────────────────────────────────────────────────────────────
const settings = {
  id: 1,
  weightUnit: 'kg',
  distanceUnit: 'km',
  lengthUnit: 'cm',
  measurementWeightUnit: null,
  defaultRestSeconds: 90,
  restTimerEnabled: true,
  restTimerSound: true,
  restTimerVibrate: true,
  autoStartRestTimer: true,
  barWeightKg: 20,
  availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
  firstDayOfWeek: 1,
  weightStepKg: 2.5,
  countWarmupSets: false,
  bodyweightKg: bodyweightAt(END_DATE.getTime()),
  weeklyGoalWorkouts: 4,
  theme: 'system',
}

// ── Assemble backup file ──────────────────────────────────────────────
const backup = {
  app: 'ironlog',
  version: 2,
  exportedAt: Date.now(),
  exercises: ALL_EXERCISES,
  workouts,
  routines: ROUTINES,
  folders,
  measurements,
  settings,
}

writeFileSync(OUT_PATH, JSON.stringify(backup, null, 2))

console.log(`Wrote ${OUT_PATH}`)
console.log(`  exercises:    ${ALL_EXERCISES.length} (${CUSTOM_EXERCISES.length} custom)`)
console.log(`  folders:      ${folders.length}`)
console.log(`  routines:     ${ROUTINES.length}`)
console.log(`  workouts:     ${workouts.length}`)
console.log(`  measurements: ${measurements.length}`)
