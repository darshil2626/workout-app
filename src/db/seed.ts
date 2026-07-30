import type { Equipment, Exercise, ExerciseKind, MuscleGroup } from './types'

/**
 * Compact seed rows: [name, muscleGroup, equipment, kind?, secondaryMuscles?].
 * `kind` defaults to 'weight_reps'.
 *
 * IDs are slugs derived from the name so routines and history keep resolving
 * across app updates. Never rename a row without keeping its slug stable.
 */
type Row = [string, MuscleGroup, Equipment, ExerciseKind?, MuscleGroup[]?]

const ROWS: Row[] = [
  // ── Chest ─────────────────────────────────────────────────────────────
  ['Bench Press (Barbell)', 'Chest', 'Barbell', 'weight_reps', ['Triceps', 'Shoulders']],
  ['Bench Press (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Triceps', 'Shoulders']],
  ['Incline Bench Press (Barbell)', 'Chest', 'Barbell', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Incline Bench Press (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Decline Bench Press (Barbell)', 'Chest', 'Barbell', 'weight_reps', ['Triceps']],
  ['Decline Bench Press (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Triceps']],
  ['Floor Press (Barbell)', 'Chest', 'Barbell', 'weight_reps', ['Triceps']],
  ['Bench Press (Smith Machine)', 'Chest', 'Smith Machine'],
  ['Chest Press (Machine)', 'Chest', 'Machine', 'weight_reps', ['Triceps']],
  ['Incline Chest Press (Machine)', 'Chest', 'Machine', 'weight_reps', ['Shoulders']],
  ['Pec Deck', 'Chest', 'Machine'],
  ['Chest Fly (Dumbbell)', 'Chest', 'Dumbbell'],
  ['Chest Fly (Machine)', 'Chest', 'Machine'],
  ['Cable Crossover', 'Chest', 'Cable'],
  ['Low Cable Crossover', 'Chest', 'Cable'],
  ['Push Up', 'Chest', 'Bodyweight', 'weighted_bodyweight', ['Triceps', 'Shoulders']],
  ['Wide Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps'],
  ['Incline Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps'],
  ['Decline Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps', ['Shoulders']],
  ['Diamond Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps', ['Triceps']],
  ['Chest Dip', 'Chest', 'Bodyweight', 'weighted_bodyweight', ['Triceps']],
  ['Pullover (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Back']],
  ['Svend Press', 'Chest', 'Plate'],

  // ── Back ──────────────────────────────────────────────────────────────
  ['Deadlift (Barbell)', 'Back', 'Barbell', 'weight_reps', ['Hamstrings', 'Glutes', 'Traps']],
  ['Sumo Deadlift (Barbell)', 'Back', 'Barbell', 'weight_reps', ['Glutes', 'Quadriceps']],
  ['Trap Bar Deadlift', 'Back', 'Barbell', 'weight_reps', ['Quadriceps', 'Glutes']],
  ['Rack Pull', 'Back', 'Barbell', 'weight_reps', ['Traps']],
  ['Bent Over Row (Barbell)', 'Back', 'Barbell', 'weight_reps', ['Biceps']],
  ['Bent Over Row (Dumbbell)', 'Back', 'Dumbbell', 'weight_reps', ['Biceps']],
  ['Pendlay Row', 'Back', 'Barbell', 'weight_reps', ['Biceps']],
  ['T-Bar Row', 'Back', 'Barbell', 'weight_reps', ['Biceps']],
  ['Seal Row', 'Back', 'Barbell', 'weight_reps', ['Biceps']],
  ['Meadows Row', 'Back', 'Barbell', 'weight_reps', ['Biceps']],
  ['Single Arm Row (Dumbbell)', 'Back', 'Dumbbell', 'weight_reps', ['Biceps']],
  ['Chest Supported Row (Machine)', 'Back', 'Machine', 'weight_reps', ['Biceps']],
  ['Seated Row (Machine)', 'Back', 'Machine', 'weight_reps', ['Biceps']],
  ['Seated Cable Row', 'Back', 'Cable', 'weight_reps', ['Biceps']],
  ['Lat Pulldown (Cable)', 'Back', 'Cable', 'weight_reps', ['Biceps']],
  ['Lat Pulldown - Wide Grip', 'Back', 'Cable', 'weight_reps', ['Biceps']],
  ['Lat Pulldown - Close Grip', 'Back', 'Cable', 'weight_reps', ['Biceps']],
  ['Straight Arm Pulldown', 'Back', 'Cable'],
  ['Pull Up', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Biceps']],
  ['Chin Up', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Biceps']],
  ['Neutral Grip Pull Up', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Biceps']],
  ['Assisted Pull Up', 'Back', 'Machine', 'assisted_bodyweight', ['Biceps']],
  ['Inverted Row', 'Back', 'Bodyweight', 'bodyweight_reps', ['Biceps']],
  ['Hyperextension', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Glutes', 'Hamstrings']],
  ['Good Morning', 'Back', 'Barbell', 'weight_reps', ['Hamstrings']],
  ['Shrug (Barbell)', 'Traps', 'Barbell'],
  ['Shrug (Dumbbell)', 'Traps', 'Dumbbell'],
  ['Shrug (Machine)', 'Traps', 'Machine'],
  ['Face Pull', 'Shoulders', 'Cable', 'weight_reps', ['Traps']],

  // ── Shoulders ─────────────────────────────────────────────────────────
  ['Overhead Press (Barbell)', 'Shoulders', 'Barbell', 'weight_reps', ['Triceps']],
  ['Overhead Press (Dumbbell)', 'Shoulders', 'Dumbbell', 'weight_reps', ['Triceps']],
  ['Seated Shoulder Press (Dumbbell)', 'Shoulders', 'Dumbbell', 'weight_reps', ['Triceps']],
  ['Shoulder Press (Machine)', 'Shoulders', 'Machine', 'weight_reps', ['Triceps']],
  ['Arnold Press', 'Shoulders', 'Dumbbell', 'weight_reps', ['Triceps']],
  ['Push Press', 'Shoulders', 'Barbell', 'weight_reps', ['Triceps', 'Quadriceps']],
  ['Behind The Neck Press', 'Shoulders', 'Barbell'],
  ['Landmine Press', 'Shoulders', 'Barbell', 'weight_reps', ['Chest']],
  ['Lateral Raise (Dumbbell)', 'Shoulders', 'Dumbbell'],
  ['Lateral Raise (Cable)', 'Shoulders', 'Cable'],
  ['Lateral Raise (Machine)', 'Shoulders', 'Machine'],
  ['Front Raise (Dumbbell)', 'Shoulders', 'Dumbbell'],
  ['Front Raise (Cable)', 'Shoulders', 'Cable'],
  ['Rear Delt Fly (Dumbbell)', 'Shoulders', 'Dumbbell'],
  ['Rear Delt Fly (Machine)', 'Shoulders', 'Machine'],
  ['Reverse Cable Fly', 'Shoulders', 'Cable'],
  ['Upright Row (Barbell)', 'Shoulders', 'Barbell', 'weight_reps', ['Traps']],
  ['Upright Row (Cable)', 'Shoulders', 'Cable', 'weight_reps', ['Traps']],
  ['Pike Push Up', 'Shoulders', 'Bodyweight', 'bodyweight_reps', ['Triceps']],
  ['Handstand Push Up', 'Shoulders', 'Bodyweight', 'bodyweight_reps', ['Triceps']],

  // ── Biceps ────────────────────────────────────────────────────────────
  ['Bicep Curl (Barbell)', 'Biceps', 'Barbell'],
  ['Bicep Curl (EZ Bar)', 'Biceps', 'Barbell'],
  ['Bicep Curl (Dumbbell)', 'Biceps', 'Dumbbell'],
  ['Alternating Bicep Curl', 'Biceps', 'Dumbbell'],
  ['Hammer Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Incline Bicep Curl', 'Biceps', 'Dumbbell'],
  ['Preacher Curl', 'Biceps', 'Barbell'],
  ['Preacher Curl (Machine)', 'Biceps', 'Machine'],
  ['Concentration Curl', 'Biceps', 'Dumbbell'],
  ['Bicep Curl (Cable)', 'Biceps', 'Cable'],
  ['Bayesian Curl', 'Biceps', 'Cable'],
  ['Spider Curl', 'Biceps', 'Dumbbell'],
  ['Zottman Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Drag Curl', 'Biceps', 'Barbell'],
  ['Reverse Curl', 'Forearms', 'Barbell', 'weight_reps', ['Biceps']],

  // ── Triceps ───────────────────────────────────────────────────────────
  ['Close Grip Bench Press', 'Triceps', 'Barbell', 'weight_reps', ['Chest']],
  ['Triceps Dip', 'Triceps', 'Bodyweight', 'weighted_bodyweight', ['Chest']],
  ['Bench Dip', 'Triceps', 'Bodyweight', 'bodyweight_reps'],
  ['Triceps Pushdown (Cable)', 'Triceps', 'Cable'],
  ['Rope Pushdown', 'Triceps', 'Cable'],
  ['Overhead Triceps Extension (Cable)', 'Triceps', 'Cable'],
  ['Overhead Triceps Extension (Dumbbell)', 'Triceps', 'Dumbbell'],
  ['Skullcrusher (EZ Bar)', 'Triceps', 'Barbell'],
  ['Skullcrusher (Dumbbell)', 'Triceps', 'Dumbbell'],
  ['Triceps Extension (Machine)', 'Triceps', 'Machine'],
  ['Triceps Kickback (Dumbbell)', 'Triceps', 'Dumbbell'],
  ['Triceps Kickback (Cable)', 'Triceps', 'Cable'],
  ['JM Press', 'Triceps', 'Barbell'],

  // ── Forearms ──────────────────────────────────────────────────────────
  ['Wrist Curl (Barbell)', 'Forearms', 'Barbell'],
  ['Wrist Curl (Dumbbell)', 'Forearms', 'Dumbbell'],
  ['Reverse Wrist Curl (Barbell)', 'Forearms', 'Barbell'],
  ['Farmers Walk', 'Forearms', 'Dumbbell', 'duration_weight', ['Traps']],
  ['Plate Pinch', 'Forearms', 'Plate', 'duration_weight'],
  ['Dead Hang', 'Forearms', 'Bodyweight', 'duration'],

  // ── Quadriceps ────────────────────────────────────────────────────────
  ['Squat (Barbell)', 'Quadriceps', 'Barbell', 'weight_reps', ['Glutes', 'Hamstrings']],
  ['Front Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Glutes']],
  ['High Bar Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Glutes']],
  ['Low Bar Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Glutes', 'Hamstrings']],
  ['Box Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Glutes']],
  ['Zercher Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Glutes']],
  ['Squat (Smith Machine)', 'Quadriceps', 'Smith Machine', 'weight_reps', ['Glutes']],
  ['Hack Squat (Machine)', 'Quadriceps', 'Machine', 'weight_reps', ['Glutes']],
  ['Belt Squat', 'Quadriceps', 'Machine', 'weight_reps', ['Glutes']],
  ['Leg Press', 'Quadriceps', 'Machine', 'weight_reps', ['Glutes']],
  ['Leg Extension', 'Quadriceps', 'Machine'],
  ['Goblet Squat', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Bulgarian Split Squat', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Split Squat', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Lunge (Dumbbell)', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Walking Lunge', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Reverse Lunge', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Step Up', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Sissy Squat', 'Quadriceps', 'Bodyweight', 'bodyweight_reps'],
  ['Pistol Squat', 'Quadriceps', 'Bodyweight', 'bodyweight_reps', ['Glutes']],
  ['Air Squat', 'Quadriceps', 'Bodyweight', 'bodyweight_reps', ['Glutes']],
  ['Wall Sit', 'Quadriceps', 'Bodyweight', 'duration'],

  // ── Hamstrings ────────────────────────────────────────────────────────
  ['Romanian Deadlift (Barbell)', 'Hamstrings', 'Barbell', 'weight_reps', ['Glutes', 'Back']],
  ['Romanian Deadlift (Dumbbell)', 'Hamstrings', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Stiff Leg Deadlift', 'Hamstrings', 'Barbell', 'weight_reps', ['Glutes']],
  ['Single Leg Romanian Deadlift', 'Hamstrings', 'Dumbbell', 'weight_reps', ['Glutes']],
  ['Lying Leg Curl', 'Hamstrings', 'Machine'],
  ['Seated Leg Curl', 'Hamstrings', 'Machine'],
  ['Standing Leg Curl', 'Hamstrings', 'Machine'],
  ['Nordic Curl', 'Hamstrings', 'Bodyweight', 'bodyweight_reps'],
  ['Glute Ham Raise', 'Hamstrings', 'Bodyweight', 'bodyweight_reps', ['Glutes']],

  // ── Glutes ────────────────────────────────────────────────────────────
  ['Hip Thrust (Barbell)', 'Glutes', 'Barbell', 'weight_reps', ['Hamstrings']],
  ['Hip Thrust (Machine)', 'Glutes', 'Machine', 'weight_reps', ['Hamstrings']],
  ['Glute Bridge', 'Glutes', 'Bodyweight', 'weighted_bodyweight', ['Hamstrings']],
  ['Glute Kickback (Cable)', 'Glutes', 'Cable'],
  ['Cable Pull Through', 'Glutes', 'Cable', 'weight_reps', ['Hamstrings']],
  ['Hip Abduction (Machine)', 'Glutes', 'Machine'],
  ['Hip Adduction (Machine)', 'Glutes', 'Machine'],
  ['Frog Pump', 'Glutes', 'Dumbbell'],
  ['Sumo Squat', 'Glutes', 'Dumbbell', 'weight_reps', ['Quadriceps']],

  // ── Calves ────────────────────────────────────────────────────────────
  ['Standing Calf Raise (Machine)', 'Calves', 'Machine'],
  ['Seated Calf Raise (Machine)', 'Calves', 'Machine'],
  ['Calf Raise (Dumbbell)', 'Calves', 'Dumbbell'],
  ['Calf Raise (Smith Machine)', 'Calves', 'Smith Machine'],
  ['Leg Press Calf Raise', 'Calves', 'Machine'],
  ['Donkey Calf Raise', 'Calves', 'Machine'],
  ['Single Leg Calf Raise', 'Calves', 'Bodyweight', 'bodyweight_reps'],

  // ── Abs ───────────────────────────────────────────────────────────────
  ['Plank', 'Abs', 'Bodyweight', 'duration'],
  ['Side Plank', 'Abs', 'Bodyweight', 'duration'],
  ['Hollow Body Hold', 'Abs', 'Bodyweight', 'duration'],
  ['Crunch', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Bicycle Crunch', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Cable Crunch', 'Abs', 'Cable'],
  ['Ab Crunch (Machine)', 'Abs', 'Machine'],
  ['Sit Up', 'Abs', 'Bodyweight', 'weighted_bodyweight'],
  ['Decline Sit Up', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Hanging Leg Raise', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Lying Leg Raise', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Captains Chair Leg Raise', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Toes To Bar', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['V-Up', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Ab Wheel Rollout', 'Abs', 'Other', 'bodyweight_reps'],
  ['Dragon Flag', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Russian Twist', 'Abs', 'Plate'],
  ['Woodchopper (Cable)', 'Abs', 'Cable'],
  ['Pallof Press', 'Abs', 'Cable'],
  ['Mountain Climbers', 'Abs', 'Bodyweight', 'duration'],
  ['Flutter Kicks', 'Abs', 'Bodyweight', 'duration'],

  // ── Neck ──────────────────────────────────────────────────────────────
  ['Neck Curl', 'Neck', 'Plate'],
  ['Neck Extension', 'Neck', 'Plate'],

  // ── Full body / olympic / conditioning ────────────────────────────────
  ['Clean And Jerk', 'Full Body', 'Barbell', 'weight_reps', ['Shoulders', 'Quadriceps']],
  ['Power Clean', 'Full Body', 'Barbell', 'weight_reps', ['Traps', 'Quadriceps']],
  ['Hang Clean', 'Full Body', 'Barbell', 'weight_reps', ['Traps']],
  ['Clean', 'Full Body', 'Barbell', 'weight_reps', ['Quadriceps']],
  ['Snatch', 'Full Body', 'Barbell', 'weight_reps', ['Shoulders']],
  ['Thruster', 'Full Body', 'Barbell', 'weight_reps', ['Shoulders', 'Quadriceps']],
  ['Kettlebell Swing', 'Full Body', 'Kettlebell', 'weight_reps', ['Glutes', 'Hamstrings']],
  ['Turkish Get Up', 'Full Body', 'Kettlebell'],
  ['Devil Press', 'Full Body', 'Dumbbell'],
  ['Man Maker', 'Full Body', 'Dumbbell'],
  ['Wall Ball', 'Full Body', 'Other', 'weight_reps', ['Quadriceps']],
  ['Burpee', 'Full Body', 'Bodyweight', 'bodyweight_reps'],
  ['Box Jump', 'Full Body', 'Bodyweight', 'reps_only', ['Quadriceps']],
  ['Broad Jump', 'Full Body', 'Bodyweight', 'reps_only', ['Quadriceps']],
  ['Jump Rope', 'Full Body', 'Other', 'duration', ['Calves']],
  ['Battle Ropes', 'Full Body', 'Other', 'duration', ['Shoulders']],
  ['Sled Push', 'Full Body', 'Machine', 'distance_duration', ['Quadriceps']],
  ['Sled Pull', 'Full Body', 'Machine', 'distance_duration', ['Back']],

  // ── Cardio ────────────────────────────────────────────────────────────
  ['Running (Treadmill)', 'Cardio', 'Machine', 'distance_duration'],
  ['Running (Outdoor)', 'Cardio', 'Bodyweight', 'distance_duration'],
  ['Walking', 'Cardio', 'Bodyweight', 'distance_duration'],
  ['Incline Walking (Treadmill)', 'Cardio', 'Machine', 'distance_duration'],
  ['Cycling (Outdoor)', 'Cardio', 'Other', 'distance_duration'],
  ['Cycling (Indoor)', 'Cardio', 'Machine', 'distance_duration'],
  ['Rowing Machine', 'Cardio', 'Machine', 'distance_duration'],
  ['Ski Erg', 'Cardio', 'Machine', 'distance_duration'],
  ['Assault Bike', 'Cardio', 'Machine', 'distance_duration'],
  ['Elliptical', 'Cardio', 'Machine', 'distance_duration'],
  ['Stair Climber', 'Cardio', 'Machine', 'duration'],
  ['Swimming', 'Cardio', 'Other', 'distance_duration'],
  ['Hiking', 'Cardio', 'Bodyweight', 'distance_duration'],
  ['HIIT', 'Cardio', 'Bodyweight', 'duration'],
  ['Stretching', 'Other', 'Bodyweight', 'duration'],
  ['Yoga', 'Other', 'Bodyweight', 'duration'],
  ['Foam Rolling', 'Other', 'Other', 'duration'],
]

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function build(): Exercise[] {
  const seen = new Set<string>()
  const out: Exercise[] = []
  for (const [name, muscleGroup, equipment, kind, secondary] of ROWS) {
    const id = slugify(name)
    // Guard against an accidental duplicate row crashing the initial seed.
    if (seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      muscleGroup,
      secondaryMuscles: secondary,
      equipment,
      kind: kind ?? 'weight_reps',
      isCustom: false,
      createdAt: 0,
    })
  }
  return out
}

export const SEED_EXERCISES: Exercise[] = build()
