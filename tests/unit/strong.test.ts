import { describe, expect, it } from 'vitest'
import { parseStrongCsv, sniffStrongDisclosedUnits } from '../../src/lib/importers/strong'
import { LB_PER_KG } from '../../src/lib/units'
import { mkEx } from './helpers'

const KG = { weightUnit: 'kg', distanceUnit: 'km' } as const
const H = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
const local = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime()

const SAMPLE = [
  H,
  '2024-03-04 18:30:00,Push Day,1h 5m,Bench Press (Barbell),1,100,5,0,0,,Felt good,8',
  '2024-03-04 18:30:00,Push Day,1h 5m,Bench Press (Barbell),2,100,5,0,0,"Paused, slow",,',
  '2024-03-04 18:30:00,Push Day,1h 5m,Bench Press (Barbell),W,60,10,0,0,,,',
  '2024-03-04 18:30:00,Push Day,1h 5m,Bench Press (Barbell),Rest Timer,0,0,0,90,,,',
  '2024-03-04 18:30:00,Push Day,1h 5m,Push Up,1,0,0,0,0,,,',
  '2024-03-06 07:00:00,Run,45m,Treadmill,1,0,0,5,1500,,,',
].join('\n')

describe('parseStrongCsv', () => {
  const parsed = parseStrongCsv(SAMPLE, KG, [], null)

  it('groups rows into workouts by date, in file order', () => {
    expect(parsed.source).toBe('strong')
    expect(parsed.workouts.map((w) => w.name)).toEqual(['Push Day', 'Run'])
    expect(parsed.warnings).toEqual([])
  })
  it('sets start, finish (from duration), status and notes', () => {
    const [push, run] = parsed.workouts
    expect(push.startedAt).toBe(local(2024, 3, 4, 18, 30))
    expect(push.finishedAt).toBe(local(2024, 3, 4, 18, 30) + 65 * 60_000)
    expect(push.status).toBe('done')
    expect(push.notes).toBe('Felt good')
    expect(run.finishedAt).toBe(local(2024, 3, 6, 7, 0) + 45 * 60_000)
    expect(run.notes).toBeUndefined()
  })
  it('maps set order codes to set types, skips Rest Timer, keeps rpe and exercise notes', () => {
    const bench = parsed.workouts[0].exercises[0]
    expect(bench.sets.map((s) => s.setType)).toEqual(['normal', 'normal', 'warmup'])
    expect(bench.sets.map((s) => [s.weight, s.reps])).toEqual([[100, 5], [100, 5], [60, 10]])
    expect(bench.sets.map((s) => s.rpe)).toEqual([8, null, null])
    expect(bench.sets.every((s) => s.completed)).toBe(true)
    expect(bench.notes).toBe('Paused, slow')
  })
  it('drops all-zero placeholder exercises from the workout', () => {
    const push = parsed.workouts[0]
    expect(push.exercises).toHaveLength(1)
    expect(push.exerciseIds).toEqual([push.exercises[0].exerciseId])
  })
  it('totals exclude warm-ups', () => {
    const push = parsed.workouts[0]
    expect(push.totalVolumeKg).toBe(1000)
    expect(push.totalSets).toBe(2)
    expect(push.totalReps).toBe(10)
  })
  it('creates classified custom exercises for unknown names', () => {
    const bench = parsed.newExercises.find((e) => e.name === 'Bench Press (Barbell)')!
    expect(bench).toMatchObject({ isCustom: true, muscleGroup: 'Chest', equipment: 'Barbell', kind: 'weight_reps' })
    const tm = parsed.newExercises.find((e) => e.name === 'Treadmill')!
    expect(tm).toMatchObject({ kind: 'distance_duration', muscleGroup: 'Cardio' })
  })
  it('cardio rows carry duration and distance in seconds / metres', () => {
    const [s] = parsed.workouts[1].exercises[0].sets
    expect(s).toMatchObject({ durationSec: 1500, distanceM: 5000, weight: null, reps: null })
  })
  it('workout with no performed sets is omitted entirely', () => {
    const only = parseStrongCsv(`${H}\n2024-03-04 18:30:00,Empty,0,Squat,1,0,0,0,0,,,`, KG, [], null)
    expect(only.workouts).toEqual([])
  })

  describe('units', () => {
    const row = (weightHeader: string, w: string) =>
      `Date,Workout Name,Duration,Exercise Name,Set Order,${weightHeader},Reps\n2024-03-04 10:00:00,A,,Squat (Barbell),1,${w},5`
    it('falls back to the option when the header does not say', () => {
      const w = parseStrongCsv(row('Weight', '225'), { weightUnit: 'lb', distanceUnit: 'km' }, [], null).workouts[0]
      expect(w.exercises[0].sets[0].weight).toBeCloseTo(225 / LB_PER_KG, 6)
    })
    it('a unit in the header overrides the option', () => {
      const w = parseStrongCsv(row('Weight (kg)', '100'), { weightUnit: 'lb', distanceUnit: 'km' }, [], null).workouts[0]
      expect(w.exercises[0].sets[0].weight).toBe(100)
      const w2 = parseStrongCsv(row('Weight (lbs)', '225'), KG, [], null).workouts[0]
      expect(w2.exercises[0].sets[0].weight).toBeCloseTo(225 / LB_PER_KG, 6)
    })
    it('distance units', () => {
      const csv = (dh: string, v: string) =>
        `Date,Workout Name,Exercise Name,Set Order,${dh},Seconds\n2024-03-04 10:00:00,A,Run,1,${v},600`
      expect(parseStrongCsv(csv('Distance', '1'), { weightUnit: 'kg', distanceUnit: 'mi' }, [], null).workouts[0].exercises[0].sets[0].distanceM).toBeCloseTo(1609.344, 6)
      expect(parseStrongCsv(csv('Distance', '2'), KG, [], null).workouts[0].exercises[0].sets[0].distanceM).toBe(2000)
      expect(parseStrongCsv(csv('Distance (meters)', '800'), { weightUnit: 'kg', distanceUnit: 'mi' }, [], null).workouts[0].exercises[0].sets[0].distanceM).toBe(800)
    })
    it('sniffStrongDisclosedUnits', () => {
      expect(sniffStrongDisclosedUnits('Date,Weight,Distance,Reps')).toEqual({ weight: false, distance: false })
      expect(sniffStrongDisclosedUnits('Date,Weight (kg),Distance (meters),Reps')).toEqual({ weight: true, distance: true })
      expect(sniffStrongDisclosedUnits('Date,Weight (lb),Distance')).toEqual({ weight: true, distance: false })
      expect(sniffStrongDisclosedUnits('')).toEqual({ weight: false, distance: false })
    })
  })

  describe('malformed input', () => {
    it('warns on missing exercise name or date and unreadable dates, keeps going', () => {
      const csv = [
        H,
        '2024-03-04 18:30:00,A,,,1,100,5,0,0,,,',
        ',A,,Squat,1,100,5,0,0,,,',
        'March 4th,A,,Squat,1,100,5,0,0,,,',
        '2024-03-05 18:30:00,B,,Squat,1,100,5,0,0,,,',
      ].join('\n')
      const r = parseStrongCsv(csv, KG, [], null)
      expect(r.workouts).toHaveLength(1)
      expect(r.workouts[0].name).toBe('B')
      expect(r.warnings).toHaveLength(3)
      expect(r.warnings[2]).toContain('March 4th')
    })
    it('empty file and header-only file', () => {
      expect(parseStrongCsv('', KG, [], null)).toMatchObject({ workouts: [], newExercises: [], warnings: [] })
      expect(parseStrongCsv(H, KG, [], null).workouts).toEqual([])
    })
    it('non-numeric weight/reps become null sets that are dropped', () => {
      const r = parseStrongCsv(`${H}\n2024-03-04 18:30:00,A,,Squat,1,abc,xyz,0,0,,,`, KG, [], null)
      expect(r.workouts).toEqual([])
    })
    it('fractional reps are rounded', () => {
      const r = parseStrongCsv(`${H}\n2024-03-04 18:30:00,A,,Squat,1,50,7.6,0,0,,,`, KG, [], null)
      expect(r.workouts[0].exercises[0].sets[0].reps).toBe(8)
    })
    it('blank workout name falls back to "Workout"', () => {
      const r = parseStrongCsv(`${H}\n2024-03-04 18:30:00,,,Squat,1,50,5,0,0,,,`, KG, [], null)
      expect(r.workouts[0].name).toBe('Workout')
    })
    it('ISO "T" separator and CRLF line endings parse', () => {
      const r = parseStrongCsv(`${H}\r\n2024-03-04T18:30:00,A,,Squat,1,50,5,0,0,,,\r\n`, KG, [], null)
      expect(r.workouts[0].startedAt).toBe(local(2024, 3, 4, 18, 30))
    })
    it('semicolon-delimited files', () => {
      const csv = 'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps\n2024-03-04 18:30:00;A;30m;Squat;1;50;5'
      const r = parseStrongCsv(csv, KG, [], null)
      expect(r.workouts[0].exercises[0].sets[0]).toMatchObject({ weight: 50, reps: 5 })
    })
    it('a UTF-8 BOM before the header is tolerated', () => {
      const r = parseStrongCsv(`﻿${H}\n2024-03-04 18:30:00,A,,Squat,1,50,5,0,0,,,`, KG, [], null)
      expect(r.workouts).toHaveLength(1)
    })
  })

  describe('duration column', () => {
    it('a "(sec)" header is read as seconds', () => {
      const csv = 'Date,Workout Name,Duration (sec),Exercise Name,Set Order,Weight,Reps\n2024-03-04 10:00:00,A,3900,Squat,1,50,5'
      const w = parseStrongCsv(csv, KG, [], null).workouts[0]
      expect(w.finishedAt! - w.startedAt).toBe(3_900_000)
    })
    it('no duration -> finishedAt equals startedAt', () => {
      const w = parseStrongCsv(`${H}\n2024-03-04 10:00:00,A,,Squat,1,50,5,0,0,,,`, KG, [], null).workouts[0]
      expect(w.finishedAt).toBe(w.startedAt)
    })
  })

  describe('exercise resolution and bodyweight', () => {
    it('reuses a library exercise by name and creates nothing', () => {
      const squat = mkEx('weight_reps', { id: 'sq', name: 'Squat (Barbell)', muscleGroup: 'Quadriceps', equipment: 'Barbell' })
      const r = parseStrongCsv(`${H}\n2024-03-04 10:00:00,A,,squat (barbell),1,100,5,0,0,,,`, KG, [squat], null)
      expect(r.newExercises).toEqual([])
      expect(r.workouts[0].exercises[0].exerciseId).toBe('sq')
      expect(r.workouts[0].exerciseIds).toEqual(['sq'])
    })
    it('bodyweight movements are scored with the supplied bodyweight', () => {
      const csv = `${H}\n2024-03-04 10:00:00,A,,Push Up,1,0,10,0,0,,,`
      const r = parseStrongCsv(csv, KG, [], 80)
      expect(r.newExercises[0].kind).toBe('bodyweight_reps')
      expect(r.workouts[0].totalVolumeKg).toBe(800)
      expect(parseStrongCsv(csv, KG, [], null).workouts[0].totalVolumeKg).toBe(0)
    })
    it('same exercise on two days is created once and reused', () => {
      const csv = `${H}\n2024-03-04 10:00:00,A,,Zzz Lift,1,50,5,0,0,,,\n2024-03-05 10:00:00,A,,Zzz Lift,1,60,5,0,0,,,`
      const r = parseStrongCsv(csv, KG, [], null)
      expect(r.newExercises).toHaveLength(1)
      expect(r.workouts[0].exercises[0].exerciseId).toBe(r.workouts[1].exercises[0].exerciseId)
    })
    it('the same exercise listed twice in a session is merged into one entry', () => {
      const csv = [H, '2024-03-04 10:00:00,A,,Squat,1,50,5,0,0,,,', '2024-03-04 10:00:00,A,,Bench,1,50,5,0,0,,,', '2024-03-04 10:00:00,A,,Squat,2,60,5,0,0,,,'].join('\n')
      const w = parseStrongCsv(csv, KG, [], null).workouts[0]
      expect(w.exercises).toHaveLength(2)
      expect(w.exercises[0].sets).toHaveLength(2)
    })
  })
})
