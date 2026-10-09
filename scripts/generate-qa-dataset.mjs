// Generates a small, hand-designed QA fixture where the correct on-screen
// result of every check is known in advance (unlike the big synthetic dataset,
// which is built to stress volume, not to be asserted against).
//
// Run with: node --experimental-strip-types scripts/generate-qa-dataset.mjs
// Outputs:  qa/qa-dataset.json   a BackupFile (src/lib/backup.ts shape)
//           qa/qa-expected.json  what the app must show for it
//
// Dates are anchored to the moment the script runs ("3 days ago" really is 3
// days ago), so re-run it before each QA pass or the relative labels drift.
// Load it in dev with  http://localhost:5173/?qa=1  (see src/dev/seedSynthetic.ts).
// Loading REPLACES everything in that browser profile, so never do it in the
// profile that holds real data.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SEED_EXERCISES } from '../src/db/seed.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'qa')
const DAY = 86400000
const NOW = Date.now()
const id = () => randomUUID()

/**
 * `n` whole days (plus three hours, so a session that ends later still reads as n days) before the moment the script ran, so the
 * app's "n days ago" is exact whatever time of day this is. Anchoring to a
 * fixed clock hour broke whenever the run happened before that hour. The
 * second argument is kept only so call sites read as before.
 */
function daysAgo(n, _hour = 0) {
  return NOW - n * DAY - 3 * 3600000
}

// ── Sets and sessions ───────────────────────────────────────────────────
const S = (weight, reps, extra = {}) => ({
  id: id(),
  weight,
  reps,
  durationSec: null,
  distanceM: null,
  rpe: null,
  setType: 'normal',
  completed: true,
  ...extra,
})
const warm = (weight, reps) => S(weight, reps, { setType: 'warmup' })
const hold = (sec) => S(null, null, { durationSec: sec })
const row = (distanceM, sec) => S(null, null, { distanceM, durationSec: sec })

const block = (exerciseId, sets, extra = {}) => ({
  id: id(),
  exerciseId,
  supersetGroup: null,
  restSeconds: null,
  sets,
  ...extra,
})

function workout({ name, ago, exercises, routineId, feeling, minutes = 60 }) {
  const startedAt = daysAgo(ago)
  let vol = 0
  let sets = 0
  let reps = 0
  for (const le of exercises) {
    for (const s of le.sets) {
      if (!s.completed || s.setType === 'warmup') continue
      sets += 1
      reps += s.reps ?? 0
      vol += (s.weight ?? 0) * (s.reps ?? 0)
    }
  }
  return {
    id: id(),
    name,
    status: 'done',
    startedAt,
    finishedAt: startedAt + minutes * 60000,
    pausedSec: 0,
    ...(routineId ? { routineId } : {}),
    exercises,
    exerciseIds: [...new Set(exercises.map((e) => e.exerciseId))],
    totalVolumeKg: vol,
    totalSets: sets,
    totalReps: reps,
    bodyweightKg: 80,
    ...(feeling ? { feeling } : {}),
  }
}

// ── Routines ────────────────────────────────────────────────────────────
const target = (reps = 5) => ({ weight: null, reps, durationSec: null, distanceM: null, setType: 'normal' })
const rx = (exerciseId, n = 3) => ({
  id: id(),
  exerciseId,
  supersetGroup: null,
  restSeconds: null,
  sets: Array.from({ length: n }, () => target()),
})
const routine = (name, order, exerciseIds, lastPerformedAt = null) => ({
  id: id(),
  name,
  folderId: null,
  exercises: exerciseIds.map((e) => rx(e)),
  order,
  createdAt: daysAgo(100),
  updatedAt: daysAgo(100),
  lastPerformedAt,
})

const R1 = routine('R1 Stale stamp ran via routine', 0, ['bench-press-barbell', 'squat-barbell', 'overhead-press-barbell'])
const R2 = routine('R2 Freeform covers all', 1, ['deadlift-barbell', 'lat-pulldown-cable', 'bicep-curl-dumbbell'])
const R3 = routine('R3 Partially covered', 2, ['pull-up', 'plank', 'inverted-row'])
const R4 = routine('R4 Never done', 3, ['push-up', 'crunch'])
const R5 = routine('R5 Stamp only', 4, ['seal-row'], daysAgo(10))
const R6 = routine('R6 Stamp older than session', 5, ['farmers-walk'], daysAgo(20))
const R7 = routine('R7 Empty', 6, [])
const R8 = routine(
  'R8 A deliberately very long routine name to check truncation and wrapping on a narrow phone screen',
  7,
  [
    'bench-press-barbell', 'squat-barbell', 'overhead-press-barbell', 'deadlift-barbell',
    'lat-pulldown-cable', 'bicep-curl-dumbbell', 'pull-up', 'plank', 'rowing-machine',
    'push-up', 'crunch', 'seal-row', 'farmers-walk', 'assisted-pull-up',
  ],
)
const R9 = routine('R9 Matched by name', 8, ['crunch', 'cable-crunch'])
const routines = [R1, R2, R3, R4, R5, R6, R7, R8, R9]

// ── Workouts ────────────────────────────────────────────────────────────
const workouts = []

// Bench progression, one session a week for 8 weeks, each with a warm-up
// that must never count. Last top set (3 days ago) is the PR baseline:
// heaviest 100 kg, best set 100x5, est. 1RM 116.7 kg.
const benchTop = [70, 75, 80, 85, 90, 92.5, 97.5, 100]
benchTop.forEach((kg, i) => {
  const ago = 3 + (benchTop.length - 1 - i) * 7
  const lastOne = i === benchTop.length - 1
  workouts.push(
    workout({
      name: lastOne ? 'R1 session via routine' : 'Bench day',
      ago,
      routineId: lastOne ? R1.id : undefined,
      feeling: lastOne ? 4 : undefined,
      exercises: [
        block('bench-press-barbell', [warm(20, 10), S(kg, 5), S(kg, 5), S(kg, 5)]),
        ...(lastOne
          ? [
              block('squat-barbell', [S(100, 5), S(100, 5), S(100, 5)]),
              block('overhead-press-barbell', [S(50, 8), S(50, 8), S(50, 8)]),
            ]
          : []),
      ],
    }),
  )
})

// R2: a freeform session (no routineId) that covers all three of R2's
// exercises plus extras. 5 days ago.
workouts.push(
  workout({
    name: 'Freeform pull',
    ago: 5,
    exercises: [
      block('deadlift-barbell', [S(140, 5), S(140, 5)]),
      block('lat-pulldown-cable', [S(60, 10), S(60, 10)]),
      block('bicep-curl-dumbbell', [S(16, 10), S(16, 10)]),
      block('seated-cable-row', [S(50, 10)]),
    ],
  }),
)

// R3: covers two of three exercises only (no rowing). 4 days ago.
// Also seeds bodyweight, duration and distance charts.
workouts.push(
  workout({
    name: 'Partial bodyweight',
    ago: 4,
    exercises: [
      block('pull-up', [S(null, 8), S(null, 7), S(null, 6)]),
      block('plank', [hold(60), hold(75), hold(90)]),
    ],
  }),
)
;[12, 19, 26].forEach((ago, i) => {
  workouts.push(
    workout({
      name: 'Bodyweight and cardio',
      ago,
      exercises: [
        block('pull-up', [S(null, 6 + i), S(null, 6 + i)]),
        block('plank', [hold(40 + i * 10)]),
        block('rowing-machine', [row(2000 + i * 250, 600 - i * 20)]),
        block('assisted-pull-up', [S(20, 8 + i), S(20, 8 + i)]),
      ],
    }),
  )
})

// R6: a session started from the routine 2 days ago, newer than its stamp.
workouts.push(
  workout({
    name: 'R6 session via routine',
    ago: 2,
    routineId: R6.id,
    exercises: [block('farmers-walk', [S(32, null, { durationSec: 45 }), S(32, null, { durationSec: 50 })])],
  }),
)

// R9: a session with the routine's name but no link and different exercises,
// the way an import or a repeated session arrives. 6 days ago.
workouts.push(
  workout({ name: 'R9 Matched by name', ago: 6, exercises: [block('squat-barbell', [S(90, 5), S(90, 5)])] }),
)

// History layout cases.
workouts.push(
  workout({
    name: 'History eight exercises',
    ago: 40,
    feeling: 5,
    exercises: [
      'bench-press-barbell', 'squat-barbell', 'deadlift-barbell', 'overhead-press-barbell',
      'lat-pulldown-cable', 'bicep-curl-dumbbell', 'seated-cable-row', 'crunch',
    ].map((e) => block(e, [S(40, 10), S(40, 10)])),
  }),
  workout({
    name: 'History one set',
    ago: 41,
    exercises: [block('bench-press-barbell', [S(60, 5)])],
  }),
  workout({ name: 'History empty', ago: 42, exercises: [] }),
)

// Consistency: a three-week run, then a three-week gap, so best streak and
// current streak differ and the heatmap has clearly empty regions.
;[60, 67, 74].forEach((ago) =>
  workouts.push(workout({ name: 'Old run', ago, exercises: [block('squat-barbell', [S(80, 5), S(80, 5)])] })),
)

// ── Measurements ────────────────────────────────────────────────────────
const measurements = []
for (let w = 12; w >= 0; w--) {
  measurements.push({ id: id(), type: 'bodyweight', value: 80 - (12 - w) * 0.1, takenAt: daysAgo(w * 7, 8) })
}
;[28, 14, 0].forEach((ago, i) =>
  measurements.push({ id: id(), type: 'waist', value: 84 - i, takenAt: daysAgo(ago, 8) }),
)

// ── Backup file ─────────────────────────────────────────────────────────
const backup = {
  app: 'trana',
  version: 2,
  exportedAt: NOW,
  exercises: SEED_EXERCISES,
  workouts,
  routines,
  folders: [],
  measurements,
  settings: {
    id: 1,
    weightUnit: 'kg',
    distanceUnit: 'km',
    lengthUnit: 'cm',
    measurementWeightUnit: null,
    defaultRestSeconds: 90,
    restTimerEnabled: true,
    restTimerSound: false,
    restTimerVibrate: false,
    autoStartRestTimer: true,
    barWeightKg: 20,
    availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25],
    firstDayOfWeek: 1,
    weightStepKg: 2.5,
    countWarmupSets: false,
    bodyweightKg: 80,
    weeklyGoalWorkouts: 4,
    theme: 'light',
  },
}

// ── What the app must show ──────────────────────────────────────────────
const expected = {
  anchor: new Date(NOW).toISOString(),
  // `lastDone` is the text after "Last done " on the routine's Home card, or
  // null when the card must not show a last-done line at all (never done).
  routineLabels: {
    [R1.name]: { lastDone: '3d ago', why: 'stamp is null but a session ran from this routine 3 days ago' },
    [R2.name]: { lastDone: '5d ago', why: 'no routineId but a session covered all 3 exercises 5 days ago' },
    [R3.name]: { lastDone: null, why: 'sessions cover pull-up and plank but never inverted-row, and none ran from it' },
    [R4.name]: { lastDone: null, why: 'nothing touches it' },
    [R5.name]: { lastDone: '1w ago', why: 'the stored stamp (10 days ago) is kept when no session is newer' },
    [R6.name]: { lastDone: '2d ago', why: 'a session 2 days ago beats the 20 day old stamp' },
    [R7.name]: { lastDone: null, why: 'an empty routine is never derived as performed' },
    [R9.name]: { lastDone: '6d ago', why: 'no link and different exercises, but a session carries the routine name' },
  },
  historyCards: {
    'History eight exercises': { rows: 3, more: '+5 more', firstRow: ['Bench Press (Barbell)', '2 sets'] },
    'History one set': { rows: 1, firstRow: ['Bench Press (Barbell)', '1 set'] },
    'History empty': { text: 'No exercises logged' },
  },
  exerciseMetricChips: {
    'bench-press-barbell': ['Heaviest', 'Est. 1RM', 'Volume', 'Total reps', 'Best set', 'Sets'],
    'pull-up': ['Heaviest', 'Est. 1RM', 'Volume', 'Total reps', 'Best set', 'Sets'],
    'assisted-pull-up': ['Total reps', 'Best set', 'Sets'],
    plank: ['Time', 'Sets'],
    'rowing-machine': ['Distance', 'Time', 'Sets'],
    'farmers-walk': ['Heaviest', 'Time', 'Sets'],
  },
  benchPr: {
    baseline: { heaviestKg: 100, bestSet: '100 x 5', estOneRmKg: 116.7 },
    mustBadge: 'a 102.5 kg x 5 set',
    mustNotBadge: 'a 100 kg x 5 set (equal) or any 20 kg warm-up',
  },
  warmupsExcluded: 'Bench session volume for the first week is 70*5*3 = 1050 kg, not 1050 + 200',
  statsTiles: 'four small tiles render 2x2 (training age present)',
  measurements: 'bodyweight 13 points ending today, waist 3 points, none in the future',
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'qa-dataset.json'), JSON.stringify(backup, null, 1))
writeFileSync(join(OUT_DIR, 'qa-expected.json'), JSON.stringify(expected, null, 2))
console.log(`Wrote ${workouts.length} workouts, ${routines.length} routines, ${measurements.length} measurements to ${OUT_DIR}`)
