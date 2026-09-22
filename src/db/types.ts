/**
 * Canonical storage rules:
 *  - All weights are stored in KILOGRAMS. Convert only at the UI edge.
 *  - All durations are stored in SECONDS.
 *  - All distances are stored in METRES.
 *  - All timestamps are epoch milliseconds.
 */

export type MuscleGroup =
  | 'Chest'
  | 'Back'
  | 'Shoulders'
  | 'Biceps'
  | 'Triceps'
  | 'Forearms'
  | 'Quadriceps'
  | 'Hamstrings'
  | 'Glutes'
  | 'Calves'
  | 'Abs'
  | 'Traps'
  | 'Neck'
  | 'Full Body'
  | 'Cardio'
  | 'Other'

export type Equipment =
  | 'Barbell'
  | 'Dumbbell'
  | 'Machine'
  | 'Cable'
  | 'Bodyweight'
  | 'Kettlebell'
  | 'Band'
  | 'Plate'
  | 'Smith Machine'
  | 'Other'

/** Determines which input fields a set row shows. */
export type ExerciseKind =
  | 'weight_reps' // 100 kg x 5
  | 'bodyweight_reps' // x 12
  | 'weighted_bodyweight' // bodyweight +20 kg x 8
  | 'assisted_bodyweight' // bodyweight -30 kg x 8
  | 'duration' // 60 s
  | 'duration_weight' // 30 s holding 20 kg
  | 'distance_duration' // 5000 m in 25:00
  | 'reps_only' // x 20

export interface Exercise {
  id: string
  name: string
  muscleGroup: MuscleGroup
  /** Secondary muscles worked, for filtering and future muscle-volume charts. */
  secondaryMuscles?: MuscleGroup[]
  equipment: Equipment
  kind: ExerciseKind
  /** User-authored exercises are editable and deletable; seeded ones are not. */
  isCustom: boolean
  /**
   * Set when the user edits a built-in exercise. Re-seeding skips these rows so
   * a corrected built-in definition never overwrites someone's own wording.
   */
  userEdited?: boolean
  /** Persistent note shown every time the exercise is logged. */
  notes?: string
  /** Hidden from pickers but kept so historical workouts stay readable. */
  archived?: boolean
  createdAt: number
}

export type SetType =
  | 'normal'
  | 'warmup'
  | 'drop'
  | 'failure'

export interface LoggedSet {
  id: string
  /** Kilograms. Null until the user enters a value. */
  weight: number | null
  reps: number | null
  durationSec: number | null
  distanceM: number | null
  /** Rate of perceived exertion, 6–10 in half steps. */
  rpe: number | null
  setType: SetType
  completed: boolean
}

export interface LoggedExercise {
  id: string
  exerciseId: string
  /** Note for this session only. */
  notes?: string
  /** Overrides the global default rest timer for this exercise. */
  restSeconds?: number | null
  /**
   * Exercises sharing a superset group are performed back to back.
   * Null means the exercise stands alone.
   */
  supersetGroup: number | null
  sets: LoggedSet[]
}

export type WorkoutStatus = 'active' | 'done'

export interface Workout {
  id: string
  name: string
  status: WorkoutStatus
  startedAt: number
  finishedAt: number | null
  /** Seconds spent paused, subtracted from elapsed time. */
  pausedSec: number
  notes?: string
  /** Routine this session was started from, if any. */
  routineId?: string
  exercises: LoggedExercise[]
  /** Denormalised multi-entry index so "last time I did X" stays a single query. */
  exerciseIds: string[]
  /** Cached totals so history lists don't recompute on every render. */
  totalVolumeKg: number
  totalSets: number
  totalReps: number
  bodyweightKg?: number | null
  /**
   * How the whole session went, asked once on finish and always skippable.
   * Both are 1–5; not indexed, so they needed no schema version bump.
   */
  effort?: number
  feeling?: number
}

export interface RoutineSetTarget {
  /** Kilograms, optional target shown as a placeholder while logging. */
  weight: number | null
  reps: number | null
  durationSec: number | null
  distanceM: number | null
  setType: SetType
}

export interface RoutineExercise {
  id: string
  exerciseId: string
  notes?: string
  restSeconds?: number | null
  supersetGroup: number | null
  sets: RoutineSetTarget[]
}

export interface Routine {
  id: string
  name: string
  folderId: string | null
  exercises: RoutineExercise[]
  order: number
  createdAt: number
  updatedAt: number
  /** Populated when the routine is completed, for "last performed" labels. */
  lastPerformedAt?: number | null
}

export interface Folder {
  id: string
  name: string
  order: number
  createdAt: number
}

export type WeightUnit = 'kg' | 'lb'
export type DistanceUnit = 'km' | 'mi'
export type LengthUnit = 'cm' | 'in'

/** What kind of quantity a measurement records, which fixes its unit. */
export type MeasurementKind = 'weight' | 'percent' | 'length'

export type MeasurementType =
  | 'bodyweight'
  | 'bodyFat'
  | 'neck'
  | 'shoulders'
  | 'chest'
  | 'waist'
  | 'hips'
  | 'leftBicep'
  | 'rightBicep'
  | 'leftForearm'
  | 'rightForearm'
  | 'leftThigh'
  | 'rightThigh'
  | 'leftCalf'
  | 'rightCalf'

export interface Measurement {
  id: string
  type: MeasurementType
  /**
   * Canonical value: kilograms for weight, percent for bodyFat,
   * centimetres for every circumference.
   */
  value: number
  takenAt: number
  notes?: string
}

export interface Settings {
  /** Single-row table; always 1. */
  id: number
  weightUnit: WeightUnit
  distanceUnit: DistanceUnit
  lengthUnit: LengthUnit
  /**
   * Unit for weight-based measurements (bodyweight). Null follows weightUnit,
   * so someone who lifts in kg can still weigh themselves in pounds.
   */
  measurementWeightUnit: WeightUnit | null
  defaultRestSeconds: number
  restTimerEnabled: boolean
  restTimerSound: boolean
  restTimerVibrate: boolean
  /** Auto-start the rest timer when a set is ticked complete. */
  autoStartRestTimer: boolean
  /** Barbell weight used by the plate calculator, in kg. */
  barWeightKg: number
  /** Plate pairs available in the gym, in kg. */
  availablePlatesKg: number[]
  firstDayOfWeek: 0 | 1
  /** Increment used by the +/- stepper next to weight inputs, in kg. */
  weightStepKg: number
  /**
   * Whether warm-up sets count toward volume, set counts and records. Off by
   * default: a warm-up is preparation, not a training stimulus. Toggling it
   * recomputes every stored session's cached totals.
   */
  countWarmupSets: boolean
  /**
   * Current bodyweight in kg. Used to score bodyweight and weighted-bodyweight
   * exercises; null means those movements contribute no volume.
   */
  bodyweightKg: number | null
  /** Workouts per week the home goal ring is measured against. */
  weeklyGoalWorkouts: number
}
