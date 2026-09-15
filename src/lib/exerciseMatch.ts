import type { Equipment, Exercise, ExerciseKind, MuscleGroup } from '../db/types'

/**
 * Matching imported exercise names against the library.
 *
 * Strong and Hevy name the same movement slightly differently from this app —
 * "Back Extension" vs "Hyperextension", "Arnold Press (Dumbbell)" vs "Arnold
 * Press", "Tricep" vs "Triceps". Comparing raw strings dumps most of an import
 * into new custom exercises with no muscle group, which empties out the muscle
 * balance chart and the body diagram.
 *
 * The ladder below reuses a library entry only when the movement really is the
 * same. Everything below `variant` classifies a *new* exercise instead of
 * claiming an identity, so a bad guess costs a wrong muscle group — editable in
 * the app — rather than history merged onto the wrong lift.
 *
 * Kept free of Dexie so the importer, the repair pass and tests can all use it.
 */

export interface RowShape {
  hasWeight: boolean
  hasReps: boolean
  hasDuration: boolean
  hasDistance: boolean
}

/** Both Strong and Hevy name exercises "Base Name (Equipment)", same convention this app's library uses. */
const EQUIPMENT_ALIASES: Record<string, Equipment> = {
  barbell: 'Barbell',
  bb: 'Barbell',
  'ez bar': 'Barbell',
  'ez-bar': 'Barbell',
  dumbbell: 'Dumbbell',
  db: 'Dumbbell',
  machine: 'Machine',
  'dumbbell machine': 'Machine',
  cable: 'Cable',
  cables: 'Cable',
  bodyweight: 'Bodyweight',
  'body weight': 'Bodyweight',
  kettlebell: 'Kettlebell',
  kb: 'Kettlebell',
  band: 'Band',
  'resistance band': 'Band',
  plate: 'Plate',
  'smith machine': 'Smith Machine',
  smith: 'Smith Machine',
}

const KIND_HINT_ALIASES: Record<string, ExerciseKind> = {
  assisted: 'assisted_bodyweight',
  weighted: 'weighted_bodyweight',
}

export interface NameHint {
  equipment: Equipment
  kindHint: ExerciseKind | null
}

/** Splits "Bench Press (Barbell)" into its base name and trailing qualifier. */
export function splitName(name: string): { base: string; qualifier: string | null } {
  const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(name.trim())
  if (!m) return { base: name.trim(), qualifier: null }
  return { base: m[1].trim(), qualifier: m[2].trim() }
}

/**
 * The equipment a qualifier names, if any. Strong tacks grip details onto the
 * equipment — "Cable - Straight Bar" — so only the part before a dash or comma
 * is considered.
 */
function equipmentFromQualifier(qualifier: string | null): Equipment | null {
  if (!qualifier) return null
  const head = qualifier.split(/\s+-\s+|,/)[0].trim().toLowerCase()
  return EQUIPMENT_ALIASES[head] ?? null
}

/** Reads the "(Equipment)" suffix off an exercise name, if present. */
export function hintFromName(name: string): NameHint {
  const { qualifier } = splitName(name)
  if (!qualifier) return { equipment: 'Other', kindHint: null }
  const token = qualifier.toLowerCase()
  if (token in KIND_HINT_ALIASES) return { equipment: 'Bodyweight', kindHint: KIND_HINT_ALIASES[token] }
  return { equipment: equipmentFromQualifier(qualifier) ?? 'Other', kindHint: null }
}

/** Infers an ExerciseKind for a brand-new exercise from the values actually seen for it. */
export function inferKind(shape: RowShape, hint: NameHint): ExerciseKind {
  if (hint.kindHint) return hint.kindHint
  if (shape.hasDistance) return 'distance_duration'
  if (shape.hasDuration && !shape.hasReps) return shape.hasWeight ? 'duration_weight' : 'duration'
  if (hint.equipment === 'Bodyweight' || (!shape.hasWeight && shape.hasReps)) return 'bodyweight_reps'
  if (shape.hasWeight && shape.hasReps) return 'weight_reps'
  return 'weight_reps'
}

/** Spelling and abbreviation variants that mean the same word. */
const WORD_SYNONYMS: Record<string, string> = {
  tricep: 'triceps',
  bicep: 'biceps',
  ab: 'abs',
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  flye: 'fly',
  flyes: 'fly',
  flys: 'fly',
  flies: 'fly',
  curls: 'curl',
  presses: 'press',
  raises: 'raise',
  rows: 'row',
  dips: 'dip',
  squats: 'squat',
  lunges: 'lunge',
  crunches: 'crunch',
  shrugs: 'shrug',
  extensions: 'extension',
  pulldowns: 'pulldown',
  pushdowns: 'pushdown',
  ups: 'up',
}

/** Applied before tokenising, for variants that span a word boundary. */
const PHRASE_FIXES: [RegExp, string][] = [
  [/\biso lateral\b/g, ''], // a machine brand's wording, not a different movement
  [/\bpull down\b/g, 'pulldown'],
  [/\bpush down\b/g, 'pushdown'],
  [/\bskull crusher\b/g, 'skullcrusher'],
  [/\bhyper extension\b/g, 'hyperextension'],
  [/\bsit up\b/g, 'situp'],
  [/\bpush up\b/g, 'pushup'],
]

/**
 * Case, accents, punctuation, plurals and abbreviations folded away, so two
 * spellings of one movement collapse to the same string.
 */
export function canonicalName(name: string): string {
  let s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  for (const [re, to] of PHRASE_FIXES) s = s.replace(re, to)
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => WORD_SYNONYMS[w] ?? w)
    .join(' ')
}

/**
 * Names the library spells differently enough that no amount of normalising
 * connects them. Keys are canonicalName output, values are seed ids (slugs),
 * which seed.ts pins as the stable contract. Extend as new exports turn up.
 */
const NAME_ALIASES: Record<string, string> = {
  'back extension': 'hyperextension',
  'seated row cable': 'seated-cable-row',
  'cable seated row': 'seated-cable-row',
  'bent over one arm row dumbbell': 'single-arm-row-dumbbell',
  'one arm row dumbbell': 'single-arm-row-dumbbell',
  'seated leg press machine': 'leg-press',
  'seated leg press': 'leg-press',
  'crunch machine': 'ab-crunch-machine',
  'pull up assisted': 'assisted-pull-up',
  'assisted pull up machine': 'assisted-pull-up',
  'chin up assisted': 'assisted-pull-up',
  'lying triceps extension': 'skullcrusher-ez-bar',
  'pec fly': 'pec-deck',
  'butterfly machine': 'pec-deck',
}

/** Last resort so an unrecognised name still lands somewhere better than Other. */
const MUSCLE_KEYWORDS: [RegExp, MuscleGroup][] = [
  [/\b(calf|calves)\b/, 'Calves'],
  [/\b(wrist|forearm|grip|farmers)\b/, 'Forearms'],
  [/\b(hamstring|leg curl|nordic|good morning|romanian|stiff leg)\b/, 'Hamstrings'],
  [/\b(glute|hip thrust|bridge|kickback|frog pump)\b/, 'Glutes'],
  [/\b(squat|leg press|lunge|leg extension|quad|step up|sissy)\b/, 'Quadriceps'],
  [/\b(trap|shrug)\b/, 'Traps'],
  [/\bneck\b/, 'Neck'],
  [/\b(abs|crunch|situp|plank|oblique|twist|leg raise|knee raise|hollow|v up|toes to bar|circuit)\b/, 'Abs'],
  [/\b(triceps|dip|pushdown|skullcrusher)\b/, 'Triceps'],
  [/\b(biceps|curl)\b/, 'Biceps'],
  [/\b(row|pulldown|pull up|chin up|deadlift|lat|shrug)\b/, 'Back'],
  [/\b(shoulder|lateral raise|front raise|overhead press|arnold|face pull|rear delt|upright)\b/, 'Shoulders'],
  [/\b(bench|chest|fly|pushup|pec)\b/, 'Chest'],
  [/\b(run|walk|cycling|treadmill|elliptical|bike|swim|ski erg|stair|rowing)\b/, 'Cardio'],
]

function muscleFromKeywords(canonical: string): MuscleGroup | null {
  for (const [re, muscle] of MUSCLE_KEYWORDS) if (re.test(canonical)) return muscle
  return null
}

export type MatchConfidence =
  | 'exact'
  | 'canonical'
  | 'alias'
  | 'variant'
  | 'sibling'
  | 'related'
  | 'keyword'
  | 'none'

/** The four high-confidence rungs, the only ones allowed to claim an identity. */
export const MERGE_CONFIDENCES: readonly MatchConfidence[] = ['exact', 'canonical', 'alias', 'variant']

export interface ExerciseMatch {
  /** Set when the name resolves to an exercise already in the library — reuse it. */
  exercise: Exercise | null
  /** Otherwise, how to classify the new custom exercise instead of Other/Other. */
  classify: {
    muscleGroup: MuscleGroup
    secondaryMuscles?: MuscleGroup[]
    equipment: Equipment
    kind: ExerciseKind
  }
  confidence: MatchConfidence
}

/** Content words worth scoring on; these appear in half the library. */
const STOP_TOKENS = new Set(['machine', 'cable', 'barbell', 'dumbbell', 'the', 'with', 'and', 'bodyweight'])

function contentTokens(canonical: string): Set<string> {
  return new Set(canonical.split(' ').filter((t) => t && !STOP_TOKENS.has(t)))
}

/**
 * A searchable view of the exercise library. Built once per import or repair
 * run; `add` keeps it current as new exercises are created along the way.
 */
export class ExerciseIndex {
  private byExact = new Map<string, Exercise>()
  private byCanonical = new Map<string, Exercise>()
  private byBase = new Map<string, Exercise[]>()
  private byId = new Map<string, Exercise>()

  constructor(exercises: Exercise[]) {
    for (const e of exercises) this.add(e)
  }

  add(e: Exercise): void {
    const exact = e.name.trim().toLowerCase()
    if (!this.byExact.has(exact)) this.byExact.set(exact, e)
    const canonical = canonicalName(e.name)
    if (!this.byCanonical.has(canonical)) this.byCanonical.set(canonical, e)
    const base = canonicalName(splitName(e.name).base)
    const siblings = this.byBase.get(base)
    if (siblings) siblings.push(e)
    else this.byBase.set(base, [e])
    this.byId.set(e.id, e)
  }

  /** Best candidate sharing at least two content words, for classification only. */
  private related(canonical: string): Exercise | null {
    const wanted = contentTokens(canonical)
    if (wanted.size === 0) return null
    let best: Exercise | null = null
    let bestScore = 1 // require an overlap of 2+ to say anything
    for (const e of this.byId.values()) {
      const tokens = contentTokens(canonicalName(e.name))
      let score = 0
      for (const t of wanted) if (tokens.has(t)) score++
      if (score > bestScore) {
        bestScore = score
        best = e
      }
    }
    return best
  }

  match(name: string, shape: RowShape): ExerciseMatch {
    const trimmed = name.trim()
    const hint = hintFromName(trimmed)
    const kind = inferKind(shape, hint)
    const fallback = (
      muscleGroup: MuscleGroup,
      confidence: MatchConfidence,
      secondaryMuscles?: MuscleGroup[],
      equipment?: Equipment,
    ): ExerciseMatch => ({
      exercise: null,
      classify: { muscleGroup, secondaryMuscles, equipment: equipment ?? hint.equipment, kind },
      confidence,
    })
    const reuse = (exercise: Exercise, confidence: MatchConfidence): ExerciseMatch => ({
      exercise,
      classify: {
        muscleGroup: exercise.muscleGroup,
        secondaryMuscles: exercise.secondaryMuscles,
        equipment: exercise.equipment,
        kind: exercise.kind,
      },
      confidence,
    })

    // 1. Exact, as before.
    const exact = this.byExact.get(trimmed.toLowerCase())
    if (exact) return reuse(exact, 'exact')

    // 2. Same name once spelling and punctuation are folded away.
    const canonical = canonicalName(trimmed)
    const sameCanonical = this.byCanonical.get(canonical)
    if (sameCanonical) return reuse(sameCanonical, 'canonical')

    // 3. Known synonym for a library entry.
    const aliasId = NAME_ALIASES[canonical]
    const aliased = aliasId ? this.byId.get(aliasId) : undefined
    if (aliased) return reuse(aliased, 'alias')

    // 4/5. Same base movement. Same equipment too means it is the same entry;
    // a different one is a variant the library doesn't carry, which stays its
    // own exercise so its loads don't share a PR line — but borrows the muscles.
    const { base, qualifier } = splitName(trimmed)
    const siblings = this.byBase.get(canonicalName(base)) ?? []
    if (siblings.length > 0) {
      const equipment = equipmentFromQualifier(qualifier)
      if (equipment) {
        const sameEquipment = siblings.find((e) => e.equipment === equipment)
        if (sameEquipment) return reuse(sameEquipment, 'variant')
      }
      const sibling = siblings[0]
      return fallback(
        sibling.muscleGroup,
        'sibling',
        sibling.secondaryMuscles,
        equipment ?? hint.equipment,
      )
    }

    // 6. No shared base, but enough shared words to trust the muscle group.
    const related = this.related(canonical)
    if (related) return fallback(related.muscleGroup, 'related')

    // 7. Guess from the words themselves rather than giving up to Other.
    const keyword = muscleFromKeywords(canonical)
    if (keyword) return fallback(keyword, 'keyword')

    return fallback('Other', 'none')
  }
}

/** One-shot convenience for callers without an index to reuse. */
export function matchExercise(name: string, candidates: Exercise[], shape: RowShape): ExerciseMatch {
  return new ExerciseIndex(candidates).match(name, shape)
}
