import { describe, expect, it } from 'vitest'
import {
  ExerciseIndex,
  MERGE_CONFIDENCES,
  canonicalName,
  hintFromName,
  inferKind,
  matchExercise,
  splitName,
  type NameHint,
  type RowShape,
} from '../../src/lib/exerciseMatch'
import type { Equipment, Exercise, MuscleGroup } from '../../src/db/types'
import { mkEx } from './helpers'

const shape = (o: Partial<RowShape> = {}): RowShape => ({
  hasWeight: true,
  hasReps: true,
  hasDuration: false,
  hasDistance: false,
  ...o,
})
const lib = (id: string, name: string, muscleGroup: MuscleGroup, equipment: Equipment, extra: Partial<Exercise> = {}) =>
  mkEx('weight_reps', { id, name, muscleGroup, equipment, ...extra })

describe('splitName', () => {
  it('splits a trailing parenthesised qualifier', () => {
    expect(splitName('Bench Press (Barbell)')).toEqual({ base: 'Bench Press', qualifier: 'Barbell' })
    expect(splitName('  Bench Press   (Barbell)  ')).toEqual({ base: 'Bench Press', qualifier: 'Barbell' })
  })
  it('no qualifier', () => expect(splitName('Plank')).toEqual({ base: 'Plank', qualifier: null }))
  it('only the last parenthesis group is the qualifier', () => {
    expect(splitName('Press (Dumbbell) (Incline)')).toEqual({ base: 'Press (Dumbbell)', qualifier: 'Incline' })
  })
  it('parentheses mid-name are not qualifiers', () => {
    expect(splitName('Row (Wide) Grip')).toEqual({ base: 'Row (Wide) Grip', qualifier: null })
  })
  it('empty qualifier', () => expect(splitName('Squat ()')).toEqual({ base: 'Squat', qualifier: '' }))
  it('empty string', () => expect(splitName('')).toEqual({ base: '', qualifier: null }))
})

describe('hintFromName', () => {
  it('reads equipment aliases', () => {
    expect(hintFromName('Curl (Dumbbell)')).toEqual({ equipment: 'Dumbbell', kindHint: null })
    expect(hintFromName('Curl (EZ Bar)').equipment).toBe('Barbell')
    expect(hintFromName('Press (Smith Machine)').equipment).toBe('Smith Machine')
    expect(hintFromName('Row (Cable - Straight Bar)').equipment).toBe('Cable')
    expect(hintFromName('Curl (BB)').equipment).toBe('Barbell')
  })
  it('assisted / weighted give a kind hint and bodyweight equipment', () => {
    expect(hintFromName('Pull Up (Assisted)')).toEqual({ equipment: 'Bodyweight', kindHint: 'assisted_bodyweight' })
    expect(hintFromName('Dip (Weighted)')).toEqual({ equipment: 'Bodyweight', kindHint: 'weighted_bodyweight' })
  })
  it('unknown or missing qualifier is Other', () => {
    expect(hintFromName('Thing (Mystery)')).toEqual({ equipment: 'Other', kindHint: null })
    expect(hintFromName('Plank')).toEqual({ equipment: 'Other', kindHint: null })
  })
})

describe('inferKind', () => {
  const hint = (o: Partial<NameHint> = {}): NameHint => ({ equipment: 'Other', kindHint: null, ...o })
  it('kind hint wins over everything', () => {
    expect(inferKind(shape({ hasDistance: true }), hint({ kindHint: 'assisted_bodyweight' }))).toBe(
      'assisted_bodyweight',
    )
  })
  it('distance wins next', () =>
    expect(inferKind(shape({ hasDistance: true, hasDuration: true }), hint())).toBe('distance_duration'))
  it('duration without reps', () => {
    expect(inferKind(shape({ hasWeight: false, hasReps: false, hasDuration: true }), hint())).toBe('duration')
    expect(inferKind(shape({ hasWeight: true, hasReps: false, hasDuration: true }), hint())).toBe('duration_weight')
  })
  it('duration alongside reps is not a duration exercise', () => {
    expect(inferKind(shape({ hasDuration: true }), hint())).toBe('weight_reps')
  })
  it('bodyweight equipment or reps without weight', () => {
    expect(inferKind(shape({ hasWeight: true }), hint({ equipment: 'Bodyweight' }))).toBe('bodyweight_reps')
    expect(inferKind(shape({ hasWeight: false }), hint())).toBe('bodyweight_reps')
  })
  it('weight and reps', () => expect(inferKind(shape(), hint())).toBe('weight_reps'))
  it('nothing recorded defaults to weight_reps', () => {
    expect(inferKind(shape({ hasWeight: false, hasReps: false }), hint())).toBe('weight_reps')
  })
})

describe('canonicalName', () => {
  it('folds case, punctuation and whitespace', () => {
    expect(canonicalName('  Bench   Press (Barbell) ')).toBe('bench press barbell')
    expect(canonicalName('Bench Press - Barbell')).toBe('bench press barbell')
    expect(canonicalName('')).toBe('')
  })
  it('strips accents and apostrophes', () => {
    expect(canonicalName('Café Curls')).toBe('cafe curl')
    expect(canonicalName("Farmer's Walk")).toBe('farmers walk')
    expect(canonicalName('Farmer’s Walk')).toBe('farmers walk')
  })
  it('expands ampersands', () => expect(canonicalName('Hip & Glute')).toBe('hip and glute'))
  it('applies synonyms and singularises', () => {
    expect(canonicalName('Tricep Pushdown')).toBe(canonicalName('Triceps Pushdown'))
    expect(canonicalName('DB Flyes')).toBe('dumbbell fly')
    expect(canonicalName('Bicep Curls')).toBe('biceps curl')
    expect(canonicalName('Pull Ups')).toBe('pull up')
  })
  it('joins split compound words', () => {
    expect(canonicalName('Pull Down')).toBe(canonicalName('Pulldown'))
    expect(canonicalName('Lat Pull-Down')).toBe(canonicalName('Lat Pulldown'))
    expect(canonicalName('Skull Crusher')).toBe(canonicalName('Skullcrusher'))
    expect(canonicalName('Hyper Extension')).toBe(canonicalName('Hyperextension'))
  })
  it('drops a machine brand word', () => {
    expect(canonicalName('Iso Lateral Row')).toBe('row')
  })
  it('is idempotent', () => {
    for (const n of ['Bench Press (Barbell)', 'DB Flyes', 'Push Up', "Farmer's Walk"]) {
      expect(canonicalName(canonicalName(n))).toBe(canonicalName(n))
    }
  })
  // Suspected app bug: PHRASE_FIXES run before WORD_SYNONYMS, so a plural of a
  // two-word phrase is never joined ("sit ups" -> "sit up" but "sit up" -> "situp").
  it('treats plural and singular of a two-word movement as the same', () => {
    expect(canonicalName('Push Ups')).toBe(canonicalName('Push Up'))
  })
  it('treats "Sit Ups" and "Sit Up" as the same', () => {
    expect(canonicalName('Sit Ups')).toBe(canonicalName('Sit Up'))
  })
  it('treats "Skull Crushers" and "Skull Crusher" as the same', () => {
    expect(canonicalName('Skull Crushers')).toBe(canonicalName('Skull Crusher'))
  })
  it.each([
    ['Pull Downs', 'Pull Down'],
    ['Push Downs', 'Push Down'],
    ['Lat Pull Downs', 'Lat Pulldown'],
  ])('treats "%s" and "%s" as the same', (a, b) => {
    expect(canonicalName(a)).toBe(canonicalName(b))
  })
})

describe('matchExercise confidence ladder', () => {
  const bench = lib('bench', 'Bench Press (Barbell)', 'Chest', 'Barbell', { secondaryMuscles: ['Triceps'] })
  const arnold = lib('arnold', 'Arnold Press (Dumbbell)', 'Shoulders', 'Dumbbell')
  const hyper = lib('hyperextension', 'Hyperextension', 'Back', 'Bodyweight')
  const cableRow = lib('seated-cable-row', 'Seated Cable Row', 'Back', 'Cable')
  const legPress = lib('leg-press', 'Leg Press', 'Quadriceps', 'Machine')
  const curl = lib('curl', 'Biceps Curl', 'Biceps', 'Dumbbell')
  const library = [bench, arnold, hyper, cableRow, legPress, curl]

  it('exact: case-insensitive, trimmed', () => {
    const m = matchExercise('  bench press (barbell) ', library, shape())
    expect(m.confidence).toBe('exact')
    expect(m.exercise).toBe(bench)
    expect(m.classify).toMatchObject({
      muscleGroup: 'Chest',
      equipment: 'Barbell',
      kind: 'weight_reps',
      secondaryMuscles: ['Triceps'],
    })
  })
  it('canonical: spelling/punctuation differences', () => {
    const m = matchExercise('Bench Press - Barbell', library, shape())
    expect(m).toMatchObject({ confidence: 'canonical', exercise: bench })
    expect(matchExercise('Bicep Curls', library, shape()).exercise).toBe(curl)
  })
  it('alias: known synonym resolves to the seeded id', () => {
    expect(matchExercise('Back Extension', library, shape())).toMatchObject({ confidence: 'alias', exercise: hyper })
    expect(matchExercise('Seated Row (Cable)', library, shape())).toMatchObject({
      confidence: 'alias',
      exercise: cableRow,
    })
    expect(matchExercise('Seated Leg Press (Machine)', library, shape())).toMatchObject({
      confidence: 'alias',
      exercise: legPress,
    })
  })
  it('alias is ignored when the target is not in the library', () => {
    const m = matchExercise('Back Extension', [bench], shape())
    expect(m.exercise).toBeNull()
  })
  it('variant: same base and same equipment reuses the entry', () => {
    const plain = lib('ap', 'Arnold Press', 'Shoulders', 'Dumbbell')
    const m = matchExercise('Arnold Press (Dumbbell)', [plain], shape())
    expect(m).toMatchObject({ confidence: 'variant', exercise: plain })
  })
  it('sibling: same base, different equipment stays separate but borrows muscles', () => {
    const m = matchExercise('Bench Press (Dumbbell)', library, shape())
    expect(m.exercise).toBeNull()
    expect(m.confidence).toBe('sibling')
    expect(m.classify).toMatchObject({
      muscleGroup: 'Chest',
      equipment: 'Dumbbell',
      secondaryMuscles: ['Triceps'],
      kind: 'weight_reps',
    })
  })
  it('sibling when the import has no qualifier at all', () => {
    const m = matchExercise('Arnold Press', library, shape())
    expect(m.exercise).toBeNull()
    expect(m.confidence).toBe('sibling')
    expect(m.classify.muscleGroup).toBe('Shoulders')
  })
  it('related: shares 2+ content words with a different base', () => {
    const m = matchExercise('Close Grip Bench Press (Barbell)', library, shape())
    expect(m.exercise).toBeNull()
    expect(m.confidence).toBe('related')
    expect(m.classify.muscleGroup).toBe('Chest')
  })
  it('a single shared word is not enough for related', () => {
    const m = matchExercise('Press Something Odd', library, shape())
    expect(m.confidence).not.toBe('related')
  })
  it('keyword: guesses a muscle from the words', () => {
    expect(matchExercise('Zercher Squat', library, shape())).toMatchObject({
      confidence: 'keyword',
      classify: { muscleGroup: 'Quadriceps' },
    })
    expect(
      matchExercise(
        'Treadmill Run',
        [],
        shape({ hasWeight: false, hasReps: false, hasDuration: true, hasDistance: true }),
      ),
    ).toMatchObject({ confidence: 'keyword', classify: { muscleGroup: 'Cardio', kind: 'distance_duration' } })
    expect(matchExercise('Standing Calf Raise', [], shape()).classify.muscleGroup).toBe('Calves')
    expect(matchExercise('Cable Crunch', [], shape()).classify.muscleGroup).toBe('Abs')
  })
  it('none: Other with the hinted equipment and inferred kind', () => {
    const m = matchExercise('Zzz Qqq (Kettlebell)', [], shape({ hasWeight: false }))
    expect(m).toMatchObject({
      exercise: null,
      confidence: 'none',
      classify: { muscleGroup: 'Other', equipment: 'Kettlebell', kind: 'bodyweight_reps' },
    })
  })
  it('exact match wins over everything else', () => {
    const dup = lib('dup', 'Bench Press (Barbell)', 'Other', 'Other')
    const m = matchExercise('Bench Press (Barbell)', [bench, dup], shape())
    expect(m.exercise).toBe(bench) // first registered wins
  })
  it('only the first four confidences are merge-worthy', () => {
    expect([...MERGE_CONFIDENCES]).toEqual(['exact', 'canonical', 'alias', 'variant'])
  })
  it('empty library never reuses', () => {
    expect(matchExercise('Anything', [], shape()).exercise).toBeNull()
  })
})

describe('ExerciseIndex', () => {
  it('add() makes later names matchable (second row for a new exercise reuses it)', () => {
    const idx = new ExerciseIndex([])
    expect(idx.match('Cable Fly', shape()).exercise).toBeNull()
    const created = lib('new1', 'Cable Fly', 'Chest', 'Cable')
    idx.add(created)
    expect(idx.match('cable fly', shape())).toMatchObject({ confidence: 'exact', exercise: created })
  })
})

describe('keyword fallback: cardio word endings', () => {
  it.each(['Running', 'Walking', 'Swimming', 'Jogging', 'Biking'])('%s is classified as Cardio', (name) => {
    const noShape = { hasWeight: false, hasReps: false, hasDuration: true, hasDistance: false }
    expect(matchExercise(name, [], noShape).classify.muscleGroup).toBe('Cardio')
  })
  it('does not pull strength rows into Cardio', () => {
    const noShape = { hasWeight: true, hasReps: true, hasDuration: false, hasDistance: false }
    expect(matchExercise('Seated Row', [], noShape).classify.muscleGroup).toBe('Back')
    expect(matchExercise('Walking Lunge', [], noShape).classify.muscleGroup).toBe('Quadriceps')
  })
})
