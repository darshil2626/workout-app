import { beforeEach, describe, expect, it } from 'vitest'
import { db, initDb } from '../../src/db/db'
import { recomputeAllWorkoutTotals, repairHistory, scanHistoryIssues, hasHistoryIssues } from '../../src/lib/dedupe'
import { applyExerciseFixes, hasActiveWorkout, mergeExercises, scanExerciseFixes } from '../../src/lib/exerciseRepair'
import { computeTotals } from '../../src/lib/workout'
import { customExercise, logged, resetDb, set, snapshot, workout } from './helpers'

beforeEach(async () => {
  await resetDb()
  await initDb()
  await db.routines.clear() // drop the starter routine; tests add their own
})

const blank = () => set({ weight: 0, reps: 0, completed: true })

describe('repairHistory / scanHistoryIssues', () => {
  async function seedMess() {
    const good = [logged('bench-press-barbell', [set({ weight: 60, reps: 10 })])]
    await db.workouts.bulkPut([
      // two identical sessions; the copy with a placeholder set should be the one removed
      workout({ id: 'a1', startedAt: 1000, exercises: good, totalVolumeKg: 600, totalSets: 1, totalReps: 10 }),
      workout({
        id: 'a2',
        startedAt: 1000,
        exercises: [logged('bench-press-barbell', [set({ weight: 60, reps: 10 }), blank()])],
        totalVolumeKg: 600,
        totalSets: 2,
        totalReps: 10,
      }),
      // placeholder rows only inside an otherwise real session -> rewritten
      workout({
        id: 'b',
        startedAt: 2000,
        exercises: [logged('squat-barbell', [set({ weight: 100, reps: 5 }), blank()]), logged('plank', [blank()])],
        totalVolumeKg: 500,
        totalSets: 2,
        totalReps: 5,
      }),
      // nothing recorded at all -> removed
      workout({ id: 'c', startedAt: 3000, exercises: [logged('squat-barbell', [blank()])] }),
      // active workouts are left alone
      workout({
        id: 'act',
        startedAt: 4000,
        status: 'active',
        finishedAt: null,
        exercises: [logged('squat-barbell', [blank()])],
      }),
    ])
  }

  it('scan reports without writing; repair applies exactly that; second run is a no-op', async () => {
    await seedMess()
    const before = await snapshot()
    const scan = await scanHistoryIssues()
    expect(scan).toEqual({ placeholderSets: 1, emptyWorkouts: 1, duplicates: 1 })
    expect(hasHistoryIssues(scan)).toBe(true)
    expect(await snapshot()).toEqual(before)

    const done = await repairHistory()
    expect(done).toEqual(scan)

    expect((await db.workouts.orderBy('id').toArray()).map((w) => w.id)).toEqual(['a1', 'act', 'b'])
    const b = (await db.workouts.get('b'))!
    expect(b.exercises).toHaveLength(1)
    expect(b.exercises[0].sets).toHaveLength(1)
    expect(b.exerciseIds).toEqual(['squat-barbell'])
    expect(b).toMatchObject({ totalVolumeKg: 500, totalSets: 1, totalReps: 5 })
    // Active workout untouched.
    expect((await db.workouts.get('act'))!.exercises[0].sets).toHaveLength(1)

    expect(await scanHistoryIssues()).toEqual({ placeholderSets: 0, emptyWorkouts: 0, duplicates: 0 })
    const afterFirst = await snapshot()
    expect(await repairHistory()).toEqual({ placeholderSets: 0, emptyWorkouts: 0, duplicates: 0 })
    expect(await snapshot()).toEqual(afterFirst)
  })

  it('the exerciseIds index follows the rewrite', async () => {
    await seedMess()
    await repairHistory()
    expect(await db.workouts.where('exerciseIds').equals('plank').count()).toBe(0)
    expect((await db.workouts.where('exerciseIds').equals('squat-barbell').toArray()).map((w) => w.id).sort()).toEqual([
      'act',
      'b',
    ])
  })

  it('three copies of a session leave exactly one, deterministically', async () => {
    const ex = [logged('bench-press-barbell', [set({ weight: 60, reps: 10 })])]
    await db.workouts.bulkPut(['z', 'x', 'y'].map((id) => workout({ id, startedAt: 7, exercises: ex })))
    expect(await repairHistory()).toEqual({ placeholderSets: 0, emptyWorkouts: 0, duplicates: 2 })
    expect((await db.workouts.toArray()).map((w) => w.id)).toEqual(['x'])
  })

  it('clean history reports no issues and changes nothing', async () => {
    await db.workouts.put(workout({ id: 'ok', exercises: [logged('bench-press-barbell', [set()])] }))
    const before = await snapshot()
    expect(hasHistoryIssues(await scanHistoryIssues())).toBe(false)
    await repairHistory()
    expect(await snapshot()).toEqual(before)
  })
})

describe('recomputeAllWorkoutTotals', () => {
  it('fixes stale cached totals, honours countWarmupSets, and is idempotent', async () => {
    await db.workouts.put(
      workout({
        id: 'w',
        exercises: [
          logged('bench-press-barbell', [
            set({ weight: 40, reps: 10, setType: 'warmup' }),
            set({ weight: 80, reps: 5 }),
          ]),
        ],
        totalVolumeKg: 99999,
        totalSets: 42,
        totalReps: 1,
      }),
    )
    expect(await recomputeAllWorkoutTotals()).toBe(1)
    expect(await db.workouts.get('w')).toMatchObject({ totalVolumeKg: 400, totalSets: 1, totalReps: 5 })
    expect(await recomputeAllWorkoutTotals()).toBe(0)

    await db.settings.update(1, { countWarmupSets: true })
    expect(await recomputeAllWorkoutTotals()).toBe(1)
    expect(await db.workouts.get('w')).toMatchObject({ totalVolumeKg: 800, totalSets: 2, totalReps: 15 })
    expect(await recomputeAllWorkoutTotals()).toBe(0)
  })

  it('uses per-workout bodyweight over the settings fallback for bodyweight lifts', async () => {
    await db.settings.update(1, { bodyweightKg: 100 })
    const ex = [logged('pull-up', [set({ weight: 10, reps: 5 })])]
    await db.workouts.bulkPut([
      workout({ id: 'own', startedAt: 1, bodyweightKg: 70, exercises: ex }),
      workout({ id: 'fallback', startedAt: 2, exercises: ex }),
    ])
    const kind = (await db.exercises.get('pull-up'))!.kind
    expect(['weighted_bodyweight', 'bodyweight_reps']).toContain(kind)
    await recomputeAllWorkoutTotals()
    const own = await db.workouts.get('own')
    const fb = await db.workouts.get('fallback')
    expect(own!.totalVolumeKg).not.toBe(fb!.totalVolumeKg)
    const byId = new Map((await db.exercises.toArray()).map((e) => [e.id, e] as const))
    expect(own!.totalVolumeKg).toBe(computeTotals(ex, byId, 70, false).totalVolumeKg)
  })

  it('skips active workouts', async () => {
    await db.workouts.put(
      workout({
        id: 'act',
        status: 'active',
        finishedAt: null,
        exercises: [logged('bench-press-barbell', [set()])],
        totalVolumeKg: 7,
      }),
    )
    expect(await recomputeAllWorkoutTotals()).toBe(0)
    expect((await db.workouts.get('act'))!.totalVolumeKg).toBe(7)
  })
})

describe('mergeExercises', () => {
  async function seedMerge() {
    await db.exercises.bulkPut([
      customExercise({ id: 'dup', name: 'Bench Press Barbell Custom' }),
      customExercise({ id: 'dup2', name: 'Other custom' }),
    ])
    await db.workouts.bulkPut([
      workout({
        id: 'w1',
        startedAt: 1,
        exercises: [logged('dup', [set({ weight: 50, reps: 10 })])],
        totalVolumeKg: 1,
        totalSets: 1,
        totalReps: 1,
      }),
      // session holding BOTH source and target
      workout({
        id: 'w2',
        startedAt: 2,
        exercises: [
          logged('dup', [set({ weight: 50, reps: 10 })]),
          logged('bench-press-barbell', [set({ weight: 60, reps: 10 })]),
        ],
      }),
      workout({ id: 'w3', startedAt: 3, exercises: [logged('squat-barbell', [set()])] }),
    ])
    await db.routines.put({
      id: 'r',
      name: 'R',
      folderId: null,
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      exercises: [
        { id: 're1', exerciseId: 'dup', supersetGroup: null, sets: [] },
        { id: 're2', exerciseId: 'squat-barbell', supersetGroup: null, sets: [] },
      ],
    })
  }

  it('rewrites workouts, indexes and routines, recomputes totals, deletes the source', async () => {
    await seedMerge()
    expect(await mergeExercises('dup', 'bench-press-barbell')).toBe(2)
    expect(await db.exercises.get('dup')).toBeUndefined()
    expect(await db.workouts.where('exerciseIds').equals('dup').count()).toBe(0)
    const w1 = (await db.workouts.get('w1'))!
    expect(w1.exerciseIds).toEqual(['bench-press-barbell'])
    expect(w1.exercises[0].exerciseId).toBe('bench-press-barbell')
    expect(w1).toMatchObject({ totalVolumeKg: 500, totalSets: 1, totalReps: 10 })
    const w2 = (await db.workouts.get('w2'))!
    expect(w2.exerciseIds).toEqual(['bench-press-barbell']) // deduped
    expect(w2.exercises).toHaveLength(2)
    expect(w2.totalVolumeKg).toBe(1100)
    expect(
      (await db.workouts.where('exerciseIds').equals('bench-press-barbell').toArray()).map((w) => w.id).sort(),
    ).toEqual(['w1', 'w2'])
    const r = (await db.routines.get('r'))!
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(['bench-press-barbell', 'squat-barbell'])
    expect(await db.workouts.get('w3')).toMatchObject({ exerciseIds: ['squat-barbell'] })
    // No references to the removed id anywhere.
    expect(JSON.stringify(await snapshot())).not.toContain('"dup"')
  })

  it('refuses while the source exercise is in an active workout, and changes nothing', async () => {
    await seedMerge()
    await db.workouts.put(
      workout({ id: 'act', status: 'active', finishedAt: null, startedAt: 9, exercises: [logged('dup', [set()])] }),
    )
    expect(await hasActiveWorkout()).toBe(true)
    const before = await snapshot()
    await expect(mergeExercises('dup', 'bench-press-barbell')).rejects.toThrow(/in progress/)
    expect(await snapshot()).toEqual(before)
  })

  it('an active workout elsewhere does not block merging an unrelated exercise', async () => {
    await seedMerge()
    await db.workouts.put(
      workout({
        id: 'act',
        status: 'active',
        finishedAt: null,
        startedAt: 9,
        exercises: [logged('squat-barbell', [set()])],
      }),
    )
    await expect(mergeExercises('dup', 'bench-press-barbell')).resolves.toBe(2)
  })

  it('throws and leaves data alone when the target is missing; same id is a no-op', async () => {
    await seedMerge()
    const before = await snapshot()
    await expect(mergeExercises('dup', 'nope')).rejects.toThrow(/no longer exists/)
    expect(await mergeExercises('dup', 'dup')).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it('recomputes totals using the target kind (kind differs between source and target)', async () => {
    await db.exercises.put(customExercise({ id: 'dup', name: 'Pullup thing', kind: 'weight_reps' }))
    await db.workouts.put(
      workout({ id: 'w', exercises: [logged('dup', [set({ weight: 20, reps: 5 })])], totalVolumeKg: 500 }),
    )
    await db.settings.update(1, { bodyweightKg: 80 })
    await mergeExercises('dup', 'pull-up')
    const byId = new Map((await db.exercises.toArray()).map((e) => [e.id, e] as const))
    const w = (await db.workouts.get('w'))!
    expect(w.totalVolumeKg).toBe(computeTotals(w.exercises, byId, 80, false).totalVolumeKg)
  })
})

describe('applyExerciseFixes', () => {
  async function seedFixable() {
    await db.exercises.bulkPut([
      customExercise({ id: 'imp-bench', name: 'Bench Press (Barbell)' }),
      customExercise({ id: 'imp-new', name: 'Totally Unknown Move Xyzzy' }),
    ])
    await db.workouts.bulkPut([
      workout({
        id: 'w1',
        startedAt: 1,
        exercises: [logged('imp-bench', [set({ weight: 60, reps: 10 })]), logged('imp-new', [set()])],
      }),
      workout({ id: 'w2', startedAt: 2, exercises: [logged('imp-bench', [set({ weight: 70, reps: 8 })])] }),
    ])
    await db.routines.put({
      id: 'r',
      name: 'R',
      folderId: null,
      order: 0,
      createdAt: 1,
      updatedAt: 1,
      exercises: [{ id: 're', exerciseId: 'imp-bench', supersetGroup: null, sets: [] }],
    })
  }

  it('merges an imported duplicate of a built-in; second run finds nothing', async () => {
    await seedFixable()
    const fixes = await scanExerciseFixes()
    const merge = fixes.find((f) => f.from.id === 'imp-bench')
    expect(merge?.into?.id).toBe('bench-press-barbell')
    expect(merge?.workouts).toBe(2)

    const res = await applyExerciseFixes()
    expect(res.merged).toBe(1)
    expect(res.workouts).toBe(2)
    expect(await db.exercises.get('imp-bench')).toBeUndefined()
    expect((await db.routines.get('r'))!.exercises[0].exerciseId).toBe('bench-press-barbell')
    expect((await db.workouts.get('w1'))!.exerciseIds.sort()).toEqual(['bench-press-barbell', 'imp-new'])

    const after = await snapshot()
    expect(await scanExerciseFixes().then((f) => f.filter((x) => x.into))).toEqual([])
    const again = await applyExerciseFixes()
    expect(again).toEqual({ merged: 0, reclassified: 0, workouts: 0 })
    expect(await snapshot()).toEqual(after)
  })

  it('reclassifies only blank fields and never clobbers user-set ones', async () => {
    await db.exercises.put(
      customExercise({ id: 'c', name: 'Hammer Curl', muscleGroup: 'Other', equipment: 'Dumbbell' }),
    )
    await db.exercises.put(
      customExercise({ id: 'd', name: 'Hammer Curl Mine', muscleGroup: 'Chest', equipment: 'Other' }),
    )
    const before = await db.exercises.get('d')
    await applyExerciseFixes()
    const d = await db.exercises.get('d')
    expect(d!.muscleGroup).toBe(before!.muscleGroup) // user choice preserved
    expect(await applyExerciseFixes()).toEqual({ merged: 0, reclassified: 0, workouts: 0 })
  })

  it('built-in exercises are never touched', async () => {
    const before = await db.exercises.filter((e) => !e.isCustom).toArray()
    await applyExerciseFixes()
    expect(await db.exercises.filter((e) => !e.isCustom).toArray()).toEqual(before)
  })

  it('refuses to merge under an active workout and applyExerciseFixes surfaces the error without partial rewrite', async () => {
    await seedFixable()
    await db.workouts.put(
      workout({
        id: 'act',
        status: 'active',
        finishedAt: null,
        startedAt: 9,
        exercises: [logged('imp-bench', [set()])],
      }),
    )
    const before = await snapshot()
    await expect(applyExerciseFixes()).rejects.toThrow(/in progress/)
    expect(await snapshot()).toEqual(before)
  })
})
