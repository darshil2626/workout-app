import type { Equipment, Exercise, ExerciseKind, MuscleGroup } from './types'

/**
 * Compact seed rows: [name, muscleGroup, equipment, kind?, secondaryMuscles?].
 * `kind` defaults to 'weight_reps'.
 *
 * IDs are slugs derived from the name so routines and history keep resolving
 * across app updates. Never rename a row without keeping its slug stable.
 *
 * Muscle groups (primary + secondary) are cross-checked against the
 * free-exercise-db public-domain dataset (github.com/yuhonas/free-exercise-db,
 * Unlicense), which tags ~870 exercises with primaryMuscles/secondaryMuscles.
 * Its vocabulary was translated onto ours as: lats/middle back/lower back →
 * Back, abductors/adductors → Glutes, everything else 1:1. Rows for the
 * 'Full Body' bucket (Olympic lifts, jumps, carries, conditioning) have no
 * single prime mover in that scheme, so the source's own primary muscle is
 * folded into our secondaryMuscles alongside its secondaries, and the row
 * keeps 'Full Body' as its muscleGroup — a deliberate app-level category the
 * dataset has no equivalent for, not an anatomy question it can answer.
 *
 * A few near-identical variants (barbell rows, pull-ups, lat pulldowns) are
 * tagged inconsistently *within* the source itself — e.g. Chin-Up lists
 * forearms but Pull-Up doesn't, despite being the same grip-under-load
 * movement. Where sibling entries in the same family disagree only on that
 * kind of noise, the family was given the same tags rather than reproducing
 * the source's own inconsistency; this is called out below wherever it
 * applies. Exercises with no reasonable match in the dataset (niche or
 * CrossFit-style movements: Man Maker, Devil Press, Dead Hang, Nordic Curl,
 * Dragon Flag, Hollow Body Hold, Bayesian Curl, Toes To Bar, Hip
 * Abduction/Adduction Machine, and others) keep whatever secondary muscles
 * were already recorded, or none, rather than inventing a match.
 */
type Row = [string, MuscleGroup, Equipment, ExerciseKind?, MuscleGroup[]?]

/**
 * Bump when a row below is *corrected* — a wrong muscle group, a renamed
 * movement, the wrong kind. Installed copies only re-apply the built-in rows
 * when this number moves, so a fix reaches a phone that seeded an older build.
 * Adding a new row needs no bump: missing rows are inserted on every launch.
 */
export const SEED_VERSION = 3

const ROWS: Row[] = [
  // ── Chest ─────────────────────────────────────────────────────────────
  ['Bench Press (Barbell)', 'Chest', 'Barbell', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Bench Press (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Incline Bench Press (Barbell)', 'Chest', 'Barbell', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Incline Bench Press (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Decline Bench Press (Barbell)', 'Chest', 'Barbell', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Decline Bench Press (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Shoulders', 'Triceps']],
  // No exact source match; closest is the dumbbell floor press, which the
  // source tags triceps-primary (the floor stops the descent early, cutting
  // shoulder stress and shifting emphasis to lockout).
  ['Floor Press (Barbell)', 'Triceps', 'Barbell', 'weight_reps', ['Chest', 'Shoulders']],
  ['Bench Press (Smith Machine)', 'Chest', 'Smith Machine', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Chest Press (Machine)', 'Chest', 'Machine', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Incline Chest Press (Machine)', 'Chest', 'Machine', 'weight_reps', ['Shoulders', 'Triceps']],
  ['Pec Deck', 'Chest', 'Machine'],
  ['Chest Fly (Dumbbell)', 'Chest', 'Dumbbell'],
  ['Chest Fly (Machine)', 'Chest', 'Machine'],
  ['Cable Crossover', 'Chest', 'Cable', 'weight_reps', ['Shoulders']],
  ['Low Cable Crossover', 'Chest', 'Cable', 'weight_reps', ['Shoulders']],
  ['Push Up', 'Chest', 'Bodyweight', 'weighted_bodyweight', ['Shoulders', 'Triceps']],
  ['Wide Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps', ['Abs', 'Shoulders', 'Triceps']],
  ['Incline Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps', ['Shoulders', 'Triceps']],
  ['Decline Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps', ['Shoulders', 'Triceps']],
  ['Diamond Push Up', 'Chest', 'Bodyweight', 'bodyweight_reps', ['Shoulders', 'Triceps']],
  ['Chest Dip', 'Chest', 'Bodyweight', 'weighted_bodyweight', ['Shoulders', 'Triceps']],
  ['Pullover (Dumbbell)', 'Chest', 'Dumbbell', 'weight_reps', ['Back', 'Shoulders', 'Triceps']],
  ['Svend Press', 'Chest', 'Plate', 'weight_reps', ['Forearms', 'Shoulders', 'Triceps']],

  // ── Back ──────────────────────────────────────────────────────────────
  ['Deadlift (Barbell)', 'Back', 'Barbell', 'weight_reps', ['Calves', 'Forearms', 'Glutes', 'Hamstrings', 'Quadriceps', 'Traps']],
  // Source tags Sumo Deadlift hamstrings-primary, not back.
  ['Sumo Deadlift (Barbell)', 'Hamstrings', 'Barbell', 'weight_reps', ['Back', 'Forearms', 'Glutes', 'Quadriceps', 'Traps']],
  // Source tags Trap Bar Deadlift quadriceps-primary (more upright torso, less hip hinge than conventional).
  ['Trap Bar Deadlift', 'Quadriceps', 'Barbell', 'weight_reps', ['Glutes', 'Hamstrings']],
  ['Rack Pull', 'Back', 'Barbell', 'weight_reps', ['Forearms', 'Glutes', 'Hamstrings', 'Traps']],
  // Row family (Bent Over/Pendlay/T-Bar/Seal/Meadows/Single Arm/machine and
  // cable rows): source confirms Back/Biceps/Shoulders on its exact matches;
  // Forearms is added for the whole family per the note above (the source
  // itself credits forearms on Chin-Up and Band-Assisted Pull-Up, the same
  // grip-under-load pattern, just not consistently on every row variant).
  ['Bent Over Row (Barbell)', 'Back', 'Barbell', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Bent Over Row (Dumbbell)', 'Back', 'Dumbbell', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Pendlay Row', 'Back', 'Barbell', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['T-Bar Row', 'Back', 'Barbell', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Seal Row', 'Back', 'Barbell', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Meadows Row', 'Back', 'Barbell', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Single Arm Row (Dumbbell)', 'Back', 'Dumbbell', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Chest Supported Row (Machine)', 'Back', 'Machine', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Seated Row (Machine)', 'Back', 'Machine', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Seated Cable Row', 'Back', 'Cable', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Lat Pulldown (Cable)', 'Back', 'Cable', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Lat Pulldown - Wide Grip', 'Back', 'Cable', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  ['Lat Pulldown - Close Grip', 'Back', 'Cable', 'weight_reps', ['Biceps', 'Shoulders', 'Forearms']],
  // Source tags this one empty-secondary specifically: arms stay straight, so
  // there's genuinely little bicep/forearm curling load, unlike a normal pulldown.
  ['Straight Arm Pulldown', 'Back', 'Cable'],
  ['Pull Up', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Biceps', 'Shoulders', 'Forearms']],
  ['Chin Up', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Biceps', 'Shoulders', 'Forearms']],
  ['Neutral Grip Pull Up', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Biceps', 'Shoulders', 'Forearms']],
  ['Assisted Pull Up', 'Back', 'Machine', 'assisted_bodyweight', ['Biceps', 'Shoulders', 'Forearms', 'Abs']],
  ['Inverted Row', 'Back', 'Bodyweight', 'bodyweight_reps', ['Biceps', 'Forearms']],
  ['Hyperextension', 'Back', 'Bodyweight', 'weighted_bodyweight', ['Glutes', 'Hamstrings']],
  // Source tags Good Morning hamstrings-primary, not back.
  ['Good Morning', 'Hamstrings', 'Barbell', 'weight_reps', ['Abs', 'Glutes', 'Back']],
  ['Shrug (Barbell)', 'Traps', 'Barbell'],
  ['Shrug (Dumbbell)', 'Traps', 'Dumbbell'],
  ['Shrug (Machine)', 'Traps', 'Machine', 'weight_reps', ['Shoulders']],
  ['Face Pull', 'Shoulders', 'Cable', 'weight_reps', ['Back']],

  // ── Shoulders ─────────────────────────────────────────────────────────
  ['Overhead Press (Barbell)', 'Shoulders', 'Barbell', 'weight_reps', ['Triceps']],
  ['Overhead Press (Dumbbell)', 'Shoulders', 'Dumbbell', 'weight_reps', ['Triceps']],
  ['Seated Shoulder Press (Dumbbell)', 'Shoulders', 'Dumbbell', 'weight_reps', ['Triceps']],
  ['Shoulder Press (Machine)', 'Shoulders', 'Machine', 'weight_reps', ['Triceps']],
  ['Arnold Press', 'Shoulders', 'Dumbbell', 'weight_reps', ['Triceps']],
  ['Push Press', 'Shoulders', 'Barbell', 'weight_reps', ['Quadriceps', 'Triceps']],
  ['Behind The Neck Press', 'Shoulders', 'Barbell', 'weight_reps', ['Triceps']],
  // No exact match; closest press-family analog, low confidence.
  ['Landmine Press', 'Shoulders', 'Barbell', 'weight_reps', ['Chest', 'Triceps']],
  ['Lateral Raise (Dumbbell)', 'Shoulders', 'Dumbbell'],
  ['Lateral Raise (Cable)', 'Shoulders', 'Cable'],
  ['Lateral Raise (Machine)', 'Shoulders', 'Machine'],
  ['Front Raise (Dumbbell)', 'Shoulders', 'Dumbbell'],
  ['Front Raise (Cable)', 'Shoulders', 'Cable'],
  ['Rear Delt Fly (Dumbbell)', 'Shoulders', 'Dumbbell'],
  ['Rear Delt Fly (Machine)', 'Shoulders', 'Machine'],
  ['Reverse Cable Fly', 'Shoulders', 'Cable'],
  ['Upright Row (Barbell)', 'Shoulders', 'Barbell', 'weight_reps', ['Traps']],
  // Source flips this one: cable upright row is traps-primary, shoulders-secondary.
  ['Upright Row (Cable)', 'Traps', 'Cable', 'weight_reps', ['Shoulders']],
  // No exact match (a shoulder-dominant, feet-elevated push-up variant); kept
  // distinct from the flat push-up family rather than defaulted to Chest.
  ['Pike Push Up', 'Shoulders', 'Bodyweight', 'bodyweight_reps', ['Triceps']],
  ['Handstand Push Up', 'Shoulders', 'Bodyweight', 'bodyweight_reps', ['Triceps']],

  // ── Biceps ────────────────────────────────────────────────────────────
  ['Bicep Curl (Barbell)', 'Biceps', 'Barbell', 'weight_reps', ['Forearms']],
  ['Bicep Curl (EZ Bar)', 'Biceps', 'Barbell', 'weight_reps', ['Forearms']],
  ['Bicep Curl (Dumbbell)', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Alternating Bicep Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Hammer Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Incline Bicep Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Preacher Curl', 'Biceps', 'Barbell', 'weight_reps', ['Forearms']],
  ['Preacher Curl (Machine)', 'Biceps', 'Machine', 'weight_reps', ['Forearms']],
  ['Concentration Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Bicep Curl (Cable)', 'Biceps', 'Cable', 'weight_reps', ['Forearms']],
  // No exact match; kept in line with the rest of the cable-curl family.
  ['Bayesian Curl', 'Biceps', 'Cable', 'weight_reps', ['Forearms']],
  ['Spider Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Zottman Curl', 'Biceps', 'Dumbbell', 'weight_reps', ['Forearms']],
  ['Drag Curl', 'Biceps', 'Barbell', 'weight_reps', ['Forearms']],
  // Source tags this biceps-primary, forearms-secondary — the reverse of what
  // this file had it as. It still credits forearms (now via the recovery
  // tracker's secondary-muscle counting) whenever it's logged.
  ['Reverse Curl', 'Biceps', 'Barbell', 'weight_reps', ['Forearms']],

  // ── Triceps ───────────────────────────────────────────────────────────
  ['Close Grip Bench Press', 'Triceps', 'Barbell', 'weight_reps', ['Chest', 'Shoulders']],
  ['Triceps Dip', 'Triceps', 'Bodyweight', 'weighted_bodyweight', ['Chest', 'Shoulders']],
  ['Bench Dip', 'Triceps', 'Bodyweight', 'bodyweight_reps', ['Chest', 'Shoulders']],
  ['Triceps Pushdown (Cable)', 'Triceps', 'Cable'],
  ['Rope Pushdown', 'Triceps', 'Cable'],
  ['Overhead Triceps Extension (Cable)', 'Triceps', 'Cable'],
  ['Overhead Triceps Extension (Dumbbell)', 'Triceps', 'Dumbbell'],
  ['Skullcrusher (EZ Bar)', 'Triceps', 'Barbell'],
  ['Skullcrusher (Dumbbell)', 'Triceps', 'Dumbbell', 'weight_reps', ['Chest', 'Shoulders']],
  ['Triceps Extension (Machine)', 'Triceps', 'Machine'],
  ['Triceps Kickback (Dumbbell)', 'Triceps', 'Dumbbell'],
  ['Triceps Kickback (Cable)', 'Triceps', 'Cable'],
  ['JM Press', 'Triceps', 'Barbell', 'weight_reps', ['Chest', 'Shoulders']],

  // ── Forearms ──────────────────────────────────────────────────────────
  ['Wrist Curl (Barbell)', 'Forearms', 'Barbell'],
  ['Wrist Curl (Dumbbell)', 'Forearms', 'Dumbbell'],
  ['Reverse Wrist Curl (Barbell)', 'Forearms', 'Barbell'],
  ['Farmers Walk', 'Forearms', 'Dumbbell', 'duration_weight', ['Abs', 'Glutes', 'Hamstrings', 'Back', 'Quadriceps', 'Traps']],
  ['Plate Pinch', 'Forearms', 'Plate', 'duration_weight'],
  // No source match (a static hang isn't in a strength-focused dataset); left unmatched.
  ['Dead Hang', 'Forearms', 'Bodyweight', 'duration'],

  // ── Quadriceps ────────────────────────────────────────────────────────
  ['Squat (Barbell)', 'Quadriceps', 'Barbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings', 'Back']],
  ['Front Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  // Source doesn't distinguish bar position; both use the generic squat tagging.
  ['High Bar Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings', 'Back']],
  ['Low Bar Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings', 'Back']],
  ['Box Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings', 'Back']],
  ['Zercher Squat', 'Quadriceps', 'Barbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Squat (Smith Machine)', 'Quadriceps', 'Smith Machine', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings', 'Back']],
  ['Hack Squat (Machine)', 'Quadriceps', 'Machine', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  // No exact match; kept without Back since removing spinal load is the point of the belt squat.
  ['Belt Squat', 'Quadriceps', 'Machine', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Leg Press', 'Quadriceps', 'Machine', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Leg Extension', 'Quadriceps', 'Machine'],
  ['Goblet Squat', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings', 'Shoulders']],
  ['Bulgarian Split Squat', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes', 'Hamstrings']],
  ['Split Squat', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Glutes', 'Hamstrings']],
  ['Lunge (Dumbbell)', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Walking Lunge', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Reverse Lunge', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Step Up', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Sissy Squat', 'Quadriceps', 'Bodyweight', 'bodyweight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Pistol Squat', 'Quadriceps', 'Bodyweight', 'bodyweight_reps', ['Calves', 'Glutes', 'Hamstrings']],
  ['Air Squat', 'Quadriceps', 'Bodyweight', 'bodyweight_reps', ['Glutes', 'Hamstrings']],
  // No source match (isometric hold); left unmatched.
  ['Wall Sit', 'Quadriceps', 'Bodyweight', 'duration'],

  // ── Hamstrings ────────────────────────────────────────────────────────
  ['Romanian Deadlift (Barbell)', 'Hamstrings', 'Barbell', 'weight_reps', ['Calves', 'Glutes', 'Back']],
  ['Romanian Deadlift (Dumbbell)', 'Hamstrings', 'Dumbbell', 'weight_reps', ['Glutes', 'Back']],
  ['Stiff Leg Deadlift', 'Hamstrings', 'Barbell', 'weight_reps', ['Glutes', 'Back']],
  ['Single Leg Romanian Deadlift', 'Hamstrings', 'Dumbbell', 'weight_reps', ['Glutes', 'Back']],
  ['Lying Leg Curl', 'Hamstrings', 'Machine'],
  ['Seated Leg Curl', 'Hamstrings', 'Machine'],
  ['Standing Leg Curl', 'Hamstrings', 'Machine'],
  // No source match (specific bodyweight eccentric movement); left unmatched.
  ['Nordic Curl', 'Hamstrings', 'Bodyweight', 'bodyweight_reps'],
  ['Glute Ham Raise', 'Hamstrings', 'Bodyweight', 'bodyweight_reps', ['Calves', 'Glutes']],

  // ── Glutes ────────────────────────────────────────────────────────────
  ['Hip Thrust (Barbell)', 'Glutes', 'Barbell', 'weight_reps', ['Calves', 'Hamstrings']],
  ['Hip Thrust (Machine)', 'Glutes', 'Machine', 'weight_reps', ['Calves', 'Hamstrings']],
  ['Glute Bridge', 'Glutes', 'Bodyweight', 'weighted_bodyweight', ['Calves', 'Hamstrings']],
  ['Glute Kickback (Cable)', 'Glutes', 'Cable', 'weight_reps', ['Hamstrings']],
  ['Cable Pull Through', 'Glutes', 'Cable', 'weight_reps', ['Hamstrings', 'Back']],
  // No reliable source match for the machine version (the closest entry
  // labels adduction/abduction primary=quadriceps, which reads as noise
  // rather than signal); left as originally categorized.
  ['Hip Abduction (Machine)', 'Glutes', 'Machine'],
  ['Hip Adduction (Machine)', 'Glutes', 'Machine'],
  ['Frog Pump', 'Glutes', 'Dumbbell', 'weight_reps', ['Calves', 'Hamstrings']],
  // Source tags the plié/sumo squat quadriceps-primary, not glutes.
  ['Sumo Squat', 'Quadriceps', 'Dumbbell', 'weight_reps', ['Abs', 'Calves', 'Glutes', 'Hamstrings']],

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
  ['Side Plank', 'Abs', 'Bodyweight', 'duration', ['Shoulders']],
  // No source match; left unmatched.
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
  // No source match; left unmatched.
  ['Toes To Bar', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['V-Up', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Ab Wheel Rollout', 'Abs', 'Other', 'bodyweight_reps', ['Back', 'Shoulders']],
  // No source match; left unmatched.
  ['Dragon Flag', 'Abs', 'Bodyweight', 'bodyweight_reps'],
  ['Russian Twist', 'Abs', 'Plate', 'weight_reps', ['Back']],
  ['Woodchopper (Cable)', 'Abs', 'Cable', 'weight_reps', ['Shoulders']],
  ['Pallof Press', 'Abs', 'Cable', 'weight_reps', ['Chest', 'Shoulders', 'Triceps']],
  // Source tags Mountain Climbers quadriceps-primary, not abs.
  ['Mountain Climbers', 'Quadriceps', 'Bodyweight', 'duration', ['Chest', 'Hamstrings', 'Shoulders']],
  // Source tags Flutter Kicks glutes-primary, not abs.
  ['Flutter Kicks', 'Glutes', 'Bodyweight', 'duration', ['Hamstrings']],

  // ── Neck ──────────────────────────────────────────────────────────────
  // No source match (dataset only has a stretch/SMR entry, not a strength one); left unmatched.
  ['Neck Curl', 'Neck', 'Plate'],
  ['Neck Extension', 'Neck', 'Plate'],

  // ── Full body / olympic / conditioning ────────────────────────────────
  // 'Full Body' is a deliberate app category the source dataset has no
  // equivalent for — it always names one specific prime mover even for
  // Olympic lifts. Here that source-assigned "primary" is folded into
  // secondaryMuscles alongside its own secondaries, rather than promoted to
  // replace 'Full Body' as this row's muscleGroup.
  ['Clean And Jerk', 'Full Body', 'Barbell', 'weight_reps', ['Shoulders', 'Abs', 'Glutes', 'Hamstrings', 'Back', 'Quadriceps', 'Traps', 'Triceps']],
  ['Power Clean', 'Full Body', 'Barbell', 'weight_reps', ['Hamstrings', 'Calves', 'Forearms', 'Glutes', 'Back', 'Quadriceps', 'Shoulders', 'Traps', 'Triceps']],
  ['Hang Clean', 'Full Body', 'Barbell', 'weight_reps', ['Quadriceps', 'Calves', 'Forearms', 'Glutes', 'Hamstrings', 'Back', 'Shoulders', 'Traps']],
  // No exact match; treated as the same movement family as Power Clean.
  ['Clean', 'Full Body', 'Barbell', 'weight_reps', ['Hamstrings', 'Calves', 'Forearms', 'Glutes', 'Back', 'Quadriceps', 'Shoulders', 'Traps', 'Triceps']],
  ['Snatch', 'Full Body', 'Barbell', 'weight_reps', ['Quadriceps', 'Biceps', 'Glutes', 'Hamstrings', 'Back', 'Shoulders', 'Traps', 'Triceps']],
  // No exact match; closest is the kettlebell thruster.
  ['Thruster', 'Full Body', 'Barbell', 'weight_reps', ['Shoulders', 'Quadriceps', 'Triceps']],
  ['Kettlebell Swing', 'Full Body', 'Kettlebell', 'weight_reps', ['Hamstrings', 'Calves', 'Glutes', 'Back', 'Shoulders']],
  ['Turkish Get Up', 'Full Body', 'Kettlebell', 'weight_reps', ['Shoulders', 'Abs', 'Hamstrings', 'Quadriceps', 'Triceps']],
  // No source match; left unmatched.
  ['Devil Press', 'Full Body', 'Dumbbell'],
  ['Man Maker', 'Full Body', 'Dumbbell'],
  // No exact match; closest is the kettlebell thruster (squat-to-overhead pattern).
  ['Wall Ball', 'Full Body', 'Other', 'weight_reps', ['Shoulders', 'Quadriceps', 'Triceps']],
  // No source match; left unmatched.
  ['Burpee', 'Full Body', 'Bodyweight', 'bodyweight_reps'],
  ['Box Jump', 'Full Body', 'Bodyweight', 'reps_only', ['Hamstrings', 'Calves', 'Glutes', 'Quadriceps']],
  ['Broad Jump', 'Full Body', 'Bodyweight', 'reps_only', ['Quadriceps', 'Calves', 'Glutes', 'Hamstrings']],
  ['Jump Rope', 'Full Body', 'Other', 'duration', ['Quadriceps', 'Calves', 'Hamstrings']],
  ['Battle Ropes', 'Full Body', 'Other', 'duration', ['Shoulders', 'Chest', 'Forearms']],
  ['Sled Push', 'Full Body', 'Machine', 'distance_duration', ['Quadriceps', 'Calves', 'Chest', 'Glutes', 'Hamstrings', 'Triceps']],
  // Closest match is a harness-drag entry (leg-driven); may undercount arm
  // involvement if this is logged as a rope-pull variant instead.
  ['Sled Pull', 'Full Body', 'Machine', 'distance_duration', ['Quadriceps', 'Calves', 'Glutes', 'Hamstrings']],

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
