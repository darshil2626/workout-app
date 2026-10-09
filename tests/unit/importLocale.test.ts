import { describe, expect, it } from 'vitest'
import { parseStrongCsv } from '../../src/lib/importers/strong'
import { parseHevyCsv } from '../../src/lib/importers/hevy'
import { detectFormat } from '../../src/lib/importers/detect'
import { parseFloatOrNull } from '../../src/lib/importers/shared'

const KG = { weightUnit: 'kg', distanceUnit: 'km' } as const
const H = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
const local = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime()

describe('parseFloatOrNull across locales', () => {
  it.each([
    ['82.5', 82.5],
    ['82,5', 82.5],
    ['0,125', 0.125],
    ['0.125', 0.125],
    ['1,234.5', 1234.5],
    ['1.234,5', 1234.5],
    ['1,200', 1200],
    ['1.200', 1.2],
    ['  7  ', 7],
    ['-2,5', -2.5],
    ['1e3', 1000],
  ])('%s -> %s', (raw, expected) => {
    expect(parseFloatOrNull(raw)).toBe(expected)
  })

  it.each(['', '  ', 'abc', '1,2,3', '1.2.3', '--1'])('rejects %j', (raw) => {
    expect(parseFloatOrNull(raw)).toBeNull()
  })
})

describe('Strong exports from other locales', () => {
  it('reads a semicolon file with decimal commas without losing the weights', () => {
    const csv = [
      H.replaceAll(',', ';'),
      '2024-03-04 18:30:00;Push;1h 5m;Bench Press (Barbell);1;82,5;5;0;0;;;8,5',
      '2024-03-04 18:30:00;Push;1h 5m;Bench Press (Barbell);2;85;5;0;0;;;',
    ].join('\n')
    const bench = parseStrongCsv(csv, KG, [], null).workouts[0].exercises[0]
    expect(bench.sets.map((s) => s.weight)).toEqual([82.5, 85])
    expect(bench.sets[0].rpe).toBe(8.5)
  })

  it('tolerates a UTF-8 byte-order mark, as Excel writes', () => {
    const csv = '﻿' + [H, '2024-03-04 18:30:00,Push,1h,Squat (Barbell),1,100,5,0,0,,,'].join('\n')
    expect(detectFormat(csv)).toBe('strong')
    const parsed = parseStrongCsv(csv, KG, [], null)
    expect(parsed.warnings).toEqual([])
    expect(parsed.workouts).toHaveLength(1)
    expect(parsed.workouts[0].exercises[0].sets[0].weight).toBe(100)
  })

  it('accepts a time without seconds, and an ISO "T" separator', () => {
    const csv = [
      H,
      '2024-03-04 18:30,Push,1h,Squat (Barbell),1,100,5,0,0,,,',
      '2024-03-05T07:00:00,Pull,1h,Deadlift (Barbell),1,140,3,0,0,,,',
    ].join('\n')
    const parsed = parseStrongCsv(csv, KG, [], null)
    expect(parsed.warnings).toEqual([])
    expect(parsed.workouts.map((w) => w.startedAt)).toEqual([local(2024, 3, 4, 18, 30), local(2024, 3, 5, 7, 0)])
  })

  it('handles CRLF line endings and a missing trailing newline', () => {
    const csv = [H, '2024-03-04 18:30:00,Push,1h,Squat (Barbell),1,100,5,0,0,,,'].join('\r\n')
    expect(parseStrongCsv(csv, KG, [], null).workouts).toHaveLength(1)
  })

  it('says so, rather than importing nonsense, when the dates cannot be read', () => {
    const csv = [H, '04/03/2024 18:30,Push,1h,Squat (Barbell),1,100,5,0,0,,,'].join('\n')
    const parsed = parseStrongCsv(csv, KG, [], null)
    expect(parsed.workouts).toHaveLength(0)
    expect(parsed.warnings.join(' ')).toMatch(/unreadable date/)
  })
})

describe('Hevy exports with other date styles', () => {
  const H2 =
    'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe'
  const row = (start: string) => `"Leg Day","${start}","${start}",,Squat (Barbell),,,0,normal,100,5,,,`

  it.each([
    ['4 Mar 2024, 18:30', local(2024, 3, 4, 18, 30)],
    ['4 March 2024, 18:30', local(2024, 3, 4, 18, 30)],
    ['Mar 4, 2024, 6:30 PM', local(2024, 3, 4, 18, 30)],
    ['March 4, 2024, 6:30 AM', local(2024, 3, 4, 6, 30)],
    ['Mar 4, 2024, 12:05 AM', local(2024, 3, 4, 0, 5)],
    ['Mar 4, 2024, 12:05 PM', local(2024, 3, 4, 12, 5)],
    ['2024-03-04 18:30:00', local(2024, 3, 4, 18, 30)],
  ])('reads %s', (stamp, expected) => {
    const parsed = parseHevyCsv([H2, row(stamp)].join('\n'), [], null)
    expect(parsed.warnings).toEqual([])
    expect(parsed.workouts[0].startedAt).toBe(expected)
  })

  it('tolerates a byte-order mark and decimal commas in a semicolon file', () => {
    const csv =
      '﻿' +
      [
        H2.replaceAll(',', ';'),
        '"Leg Day";"4 Mar 2024, 18:30";"4 Mar 2024, 19:30";;Squat (Barbell);;;0;normal;82,5;5;;;',
      ].join('\n')
    expect(detectFormat(csv)).toBe('hevy')
    const parsed = parseHevyCsv(csv, [], null)
    expect(parsed.workouts[0].exercises[0].sets[0].weight).toBe(82.5)
  })
})
