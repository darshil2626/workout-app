import { saveRoutinesWithFolder } from '../db/repo'
import { newId } from '../db/db'
import type { Folder, Routine, RoutineSetTarget } from '../db/types'

/**
 * Starter routines offered on the first-run screen to someone new to lifting.
 *
 * Every target is a rep count (or a hold time) and never a weight: a beginner
 * has no idea what they can lift yet, and a number in the field would read as
 * an instruction. Exercise ids are seed slugs from src/db/seed.ts; a test
 * checks that every one of them resolves to a built-in exercise.
 *
 * Ordered so the dumbbell and machine options come first. A third of new gym
 * users name the squat rack as the thing that intimidates them, so the
 * barbell routine is offered, not led with.
 *
 * Days never share an exercise. Home suggests the routine whose exercises are
 * most rested (`suggestNextRoutine`), and a lift shared by days A and B is
 * fresh in both the day after A, which ties them and suggests A again. A test
 * checks that each day is followed by the next.
 */

interface TemplateExercise {
  exerciseId: string
  sets: number
  /** Target reps per set. For a range like 8 to 12 this is the low end. */
  reps?: number
  /** Target hold per set, for timed exercises such as a plank. */
  seconds?: number
}

interface TemplateDay {
  /** The routine's name once saved. */
  name: string
  exercises: TemplateExercise[]
}

export interface Template {
  id: string
  name: string
  description: string
  daysPerWeek: number
  equipment: string
  /** One day is saved as one routine; several go into a folder named after the template. */
  days: TemplateDay[]
}

const ex = (exerciseId: string, sets: number, reps: number): TemplateExercise => ({ exerciseId, sets, reps })

export const TEMPLATES: Template[] = [
  {
    // Modelled on the r/Fitness Dumbbell Stopgap.
    id: 'full-body-dumbbells',
    name: 'Full Body (Dumbbells)',
    description: 'Two alternating full-body days, 3 sets of 8 to 12 reps.',
    daysPerWeek: 3,
    equipment: 'Dumbbells',
    days: [
      {
        name: 'Dumbbell Full Body A',
        exercises: [
          ex('goblet-squat', 3, 8),
          ex('bench-press-dumbbell', 3, 8),
          ex('bent-over-row-dumbbell', 3, 8),
          ex('bicep-curl-dumbbell', 3, 8),
        ],
      },
      {
        name: 'Dumbbell Full Body B',
        exercises: [
          ex('romanian-deadlift-dumbbell', 3, 8),
          ex('overhead-press-dumbbell', 3, 8),
          ex('lunge-dumbbell', 3, 8),
          // A different row from day A on purpose; see "Days never share an exercise" above.
          ex('single-arm-row-dumbbell', 3, 8),
        ],
      },
    ],
  },
  {
    id: 'full-body-machines',
    name: 'Full Body (Machines)',
    description: 'One full-body session on guided machines, 3 sets of 10 to 12 reps.',
    daysPerWeek: 3,
    equipment: 'Machines',
    days: [
      {
        name: 'Machine Full Body',
        exercises: [
          ex('leg-press', 3, 10),
          ex('chest-press-machine', 3, 10),
          ex('lat-pulldown-cable', 3, 10),
          ex('seated-cable-row', 3, 10),
          ex('seated-leg-curl', 3, 10),
          ex('leg-extension', 3, 10),
          ex('shoulder-press-machine', 3, 10),
        ],
      },
    ],
  },
  {
    // The r/Fitness Basic Beginner Routine. Its B day opens with chin-ups; the
    // lat pulldown is the substitution the routine itself suggests for anyone
    // who cannot do one yet, which is most beginners.
    id: 'basic-beginner-barbell',
    name: 'Basic Beginner Routine (Barbell)',
    description: 'The r/Fitness classic: two alternating days of 3 sets of 5.',
    daysPerWeek: 3,
    equipment: 'Barbell',
    days: [
      {
        name: 'Basic Beginner A',
        exercises: [ex('bent-over-row-barbell', 3, 5), ex('bench-press-barbell', 3, 5), ex('squat-barbell', 3, 5)],
      },
      {
        name: 'Basic Beginner B',
        exercises: [ex('lat-pulldown-cable', 3, 8), ex('overhead-press-barbell', 3, 5), ex('deadlift-barbell', 3, 5)],
      },
    ],
  },
  {
    // Modelled on the r/BodyweightFitness Recommended Routine's strength pairs.
    id: 'bodyweight-basics',
    name: 'Bodyweight Basics',
    description: 'No equipment beyond a bar or sturdy table. 3 sets of each.',
    daysPerWeek: 3,
    equipment: 'Bodyweight',
    days: [
      {
        name: 'Bodyweight Basics',
        exercises: [
          ex('push-up', 3, 8),
          ex('inverted-row', 3, 8),
          ex('air-squat', 3, 10),
          ex('reverse-lunge', 3, 10),
          ex('chest-dip', 3, 5),
          { exerciseId: 'plank', sets: 3, seconds: 30 },
        ],
      },
    ],
  },
  {
    id: 'upper-lower',
    name: 'Upper / Lower',
    description: 'A plain split for training four times a week.',
    daysPerWeek: 4,
    equipment: 'Full gym',
    days: [
      {
        name: 'Upper Body',
        exercises: [
          ex('bench-press-barbell', 3, 8),
          ex('lat-pulldown-cable', 3, 10),
          ex('overhead-press-dumbbell', 3, 10),
          ex('seated-cable-row', 3, 10),
          ex('bicep-curl-dumbbell', 3, 12),
          ex('triceps-pushdown-cable', 3, 12),
        ],
      },
      {
        name: 'Lower Body',
        exercises: [
          ex('squat-barbell', 3, 8),
          ex('romanian-deadlift-barbell', 3, 10),
          ex('leg-press', 3, 10),
          ex('seated-leg-curl', 3, 12),
          ex('standing-calf-raise-machine', 3, 12),
          { exerciseId: 'plank', sets: 3, seconds: 30 },
        ],
      },
    ],
  },
]

function target(e: TemplateExercise): RoutineSetTarget {
  return { weight: null, reps: e.reps ?? null, durationSec: e.seconds ?? null, distanceM: null, setType: 'normal' }
}

/** The rows a template becomes: one routine per day, in a folder when there is more than one day. */
export function buildTemplate(template: Template, now = Date.now()): { folder: Folder | null; routines: Routine[] } {
  const folder: Folder | null =
    template.days.length > 1 ? { id: newId(), name: template.name, order: 0, createdAt: now } : null
  const routines = template.days.map((day, i): Routine => ({
    id: newId(),
    name: day.name,
    folderId: folder?.id ?? null,
    order: i,
    createdAt: now,
    updatedAt: now,
    lastPerformedAt: null,
    exercises: day.exercises.map((e) => ({
      id: newId(),
      exerciseId: e.exerciseId,
      restSeconds: null,
      supersetGroup: null,
      sets: Array.from({ length: e.sets }, () => target(e)),
    })),
  }))
  return { folder, routines }
}

/**
 * Saves a template as the user's own routines and returns the first day, ready
 * to start. All or nothing, so a failure never leaves an empty folder behind.
 */
export async function installTemplate(template: Template): Promise<Routine> {
  const { folder, routines } = buildTemplate(template)
  await saveRoutinesWithFolder(folder, routines)
  return routines[0]
}
