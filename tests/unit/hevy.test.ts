import { describe, expect, it } from 'vitest'
import { parseHevyCsv } from '../../src/lib/importers/hevy'
import { LB_PER_KG, METRES_PER_MILE } from '../../src/lib/units'
import { mkEx } from './helpers'

const H = 'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime()
const LEG = '"Leg Day","4 Mar 2024, 18:30","4 Mar 2024, 19:35"'

const SAMPLE = [
  H,
  `${LEG},Great,Squat (Barbell),,Deep,0,warmup,60,8,,,`,
  `${LEG},Great,Squat (Barbell),,Deep,1,normal,100,5,,,8.5`,
  `${LEG},Great,Squat (Barbell),,,2,failure,100,3,,,`,
  `${LEG},Great,Curl (Dumbbell),1,,0,normal,15,10,,,`,
  `${LEG},Great,Row (Dumbbell),1,,0,dropset,20,10,,,`,
  `${LEG},Great,Plank,,,0,normal,,,,60,`,
  '"Morning Run","5 Mar 2024, 07:00","5 Mar 2024, 07:30",,Running,,,0,normal,,,5.0,1800,',
].join('\n')

describe('parseHevyCsv', () => {
  const parsed = parseHevyCsv(SAMPLE, [], null)
  const [leg, run] = parsed.workouts

  it('groups rows into workouts keyed by title + start time', () => {
    expect(parsed.source).toBe('hevy')
    expect(parsed.workouts.map((w) => w.name)).toEqual(['Leg Day', 'Morning Run'])
    expect(parsed.warnings).toEqual([])
  })
  it('parses "4 Mar 2024, 18:30" as local time and uses end_time for finish', () => {
    expect(leg.startedAt).toBe(local(2024, 3, 4, 18, 30))
    expect(leg.finishedAt).toBe(local(2024, 3, 4, 19, 35))
    expect(leg.notes).toBe('Great')
  })
  it('maps set types and rpe, in order', () => {
    const squat = leg.exercises[0]
    expect(squat.sets.map((s) => s.setType)).toEqual(['warmup', 'normal', 'failure'])
    expect(squat.sets.map((s) => s.rpe)).toEqual([null, 8.5, null])
    expect(squat.notes).toBe('Deep')
    expect(leg.exercises[2].sets[0].setType).toBe('drop')
  })
  it('numbers supersets by first appearance within a session', () => {
    expect(leg.exercises.map((e) => e.supersetGroup)).toEqual([null, 0, 0, null])
  })
  it('totals exclude warm-ups and count all kinds of work', () => {
    // 100x5 + 100x3 + 15x10 + 20x10 = 1150 ; sets: 2 + 1 + 1 + 1 (plank) ; reps 8+10+10
    expect(leg.totalVolumeKg).toBe(1150)
    expect(leg.totalSets).toBe(5)
    expect(leg.totalReps).toBe(28)
  })
  it('infers kinds: duration-only and distance', () => {
    const plank = parsed.newExercises.find((e) => e.name === 'Plank')!
    expect(plank.kind).toBe('duration')
    expect(leg.exercises[3].sets[0]).toMatchObject({ durationSec: 60, weight: null, reps: null })
    const running = parsed.newExercises.find((e) => e.name === 'Running')!
    expect(running.kind).toBe('distance_duration')
    expect(run.exercises[0].sets[0]).toMatchObject({ distanceM: 5000, durationSec: 1800 })
    expect(run.finishedAt).toBe(local(2024, 3, 5, 7, 30))
  })
  it('lists distinct exerciseIds', () => {
    expect(new Set(leg.exerciseIds).size).toBe(4)
    expect(leg.exerciseIds).toHaveLength(4)
  })

  describe('units from the header', () => {
    it('weight_lbs and distance_miles', () => {
      const csv = [
        'title,start_time,end_time,exercise_title,set_type,weight_lbs,reps,distance_miles,duration_seconds',
        'A,"4 Mar 2024, 10:00","4 Mar 2024, 11:00",Squat (Barbell),normal,225,5,,',
        'A,"4 Mar 2024, 10:00","4 Mar 2024, 11:00",Run,normal,,,1,600',
      ].join('\n')
      const w = parseHevyCsv(csv, [], null).workouts[0]
      expect(w.exercises[0].sets[0].weight).toBeCloseTo(225 / LB_PER_KG, 6)
      expect(w.exercises[1].sets[0].distanceM).toBeCloseTo(METRES_PER_MILE, 6)
    })
    it('defaults to kg / km', () => {
      const csv = `${H}\n${LEG},,Run,,,0,normal,,,2.5,600,`
      expect(parseHevyCsv(csv, [], null).workouts[0].exercises[0].sets[0].distanceM).toBe(2500)
    })
  })

  describe('malformed input', () => {
    it('warns on missing start time, exercise, or unreadable date', () => {
      const csv = [
        H,
        `A,,,,Squat,,,0,normal,100,5,,,`,
        `A,"4 Mar 2024, 10:00",,,,,,0,normal,100,5,,,`,
        `A,"yesterday-ish",,,Squat,,,0,normal,100,5,,,`,
        `A,"4 Mar 2024, 10:00","4 Mar 2024, 11:00",,Squat,,,0,normal,100,5,,,`,
      ].join('\n')
      const r = parseHevyCsv(csv, [], null)
      expect(r.warnings).toHaveLength(3)
      expect(r.warnings[2]).toContain('yesterday-ish')
      expect(r.workouts).toHaveLength(1)
    })
    it('unknown month abbreviation is unreadable', () => {
      const csv = `${H}\nA,"4 Foo 2024, 10:00",,,Squat,,,0,normal,100,5,,,`
      const r = parseHevyCsv(csv, [], null)
      expect(r.workouts).toEqual([])
      expect(r.warnings).toHaveLength(1)
    })
    it('full month names and no comma are accepted', () => {
      const csv = `${H}\nA,"4 March 2024 18:30",,,Squat,,,0,normal,100,5,,,`
      expect(parseHevyCsv(csv, [], null).workouts[0].startedAt).toBe(local(2024, 3, 4, 18, 30))
    })
    it('missing/invalid end_time falls back to the start time', () => {
      const csv = `${H}\nA,"4 Mar 2024, 10:00",garbage,,Squat,,,0,normal,100,5,,,`
      const w = parseHevyCsv(csv, [], null).workouts[0]
      expect(w.finishedAt).toBe(w.startedAt)
    })
    it('all-zero planned sets are dropped, and a session of only those is omitted', () => {
      const csv = `${H}\n${LEG},,Squat,,,0,normal,0,0,,,`
      expect(parseHevyCsv(csv, [], null).workouts).toEqual([])
      const mixed = `${H}\n${LEG},,Squat,,,0,normal,0,0,,,\n${LEG},,Squat,,,1,normal,50,5,,,`
      expect(parseHevyCsv(mixed, [], null).workouts[0].exercises[0].sets).toHaveLength(1)
    })
    it('empty and header-only input', () => {
      expect(parseHevyCsv('', [], null)).toMatchObject({ workouts: [], warnings: [] })
      expect(parseHevyCsv(H, [], null).workouts).toEqual([])
    })
    it('title-less sessions are named "Workout"', () => {
      const csv = `${H}\n,"4 Mar 2024, 10:00",,,Squat,,,0,normal,100,5,,,`
      expect(parseHevyCsv(csv, [], null).workouts[0].name).toBe('Workout')
    })
    it('two sessions with the same title but different start times stay separate', () => {
      const csv = `${H}\nA,"4 Mar 2024, 10:00",,,Squat,,,0,normal,100,5,,,\nA,"5 Mar 2024, 10:00",,,Squat,,,0,normal,100,5,,,`
      expect(parseHevyCsv(csv, [], null).workouts).toHaveLength(2)
    })
    it('semicolon-delimited and BOM-prefixed files', () => {
      const csv = `﻿${H.replace(/,/g, ';')}\nA;4 Mar 2024, 10:00;;;Squat;;;0;normal;100;5;;;`
      // a comma inside the date makes ';' the delimiter but the comma is data, not a separator
      const r = parseHevyCsv(csv, [], null)
      expect(r.workouts).toHaveLength(1)
      expect(r.workouts[0].exercises[0].sets[0]).toMatchObject({ weight: 100, reps: 5 })
    })
  })

  describe('exercise resolution and bodyweight', () => {
    it('reuses library exercises', () => {
      const sq = mkEx('weight_reps', { id: 'sq', name: 'Squat (Barbell)', muscleGroup: 'Quadriceps', equipment: 'Barbell' })
      const r = parseHevyCsv(`${H}\n${LEG},,Squat (Barbell),,,0,normal,100,5,,,`, [sq], null)
      expect(r.newExercises).toEqual([])
      expect(r.workouts[0].exerciseIds).toEqual(['sq'])
    })
    it('weighted bodyweight library exercise scores bodyweight + load', () => {
      const wp = mkEx('weighted_bodyweight', { id: 'wp', name: 'Pull Up (Weighted)', muscleGroup: 'Back', equipment: 'Bodyweight' })
      const csv = `${H}\n${LEG},,Pull Up (Weighted),,,0,normal,20,5,,,`
      expect(parseHevyCsv(csv, [wp], 80).workouts[0].totalVolumeKg).toBe(500)
    })
    it('the same exercise appearing in non-adjacent rows merges into one entry', () => {
      const csv = [H, `${LEG},,Squat,,,0,normal,100,5,,,`, `${LEG},,Bench,,,0,normal,60,5,,,`, `${LEG},,Squat,,,1,normal,100,5,,,`].join('\n')
      const w = parseHevyCsv(csv, [], null).workouts[0]
      expect(w.exercises.map((e) => e.sets.length)).toEqual([2, 1])
    })
  })
})
