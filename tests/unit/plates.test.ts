import { describe, expect, it } from 'vitest'
import { BAR_PRESETS_KG, PLATE_PRESETS, groupPlates, solvePlates } from '../../src/lib/plates'

const METRIC = [25, 20, 15, 10, 5, 2.5, 1.25]

describe('solvePlates', () => {
  it('loads an exact target greedily, heaviest first', () => {
    const r = solvePlates(100, 20, METRIC)!
    expect(r.perSide).toEqual([25, 15])
    expect(r.remainderKg).toBe(0)
    expect(r.achievedKg).toBe(100)
    expect(r.barKg).toBe(20)
  })
  it('repeats plates as needed', () => {
    expect(solvePlates(140, 20, METRIC)!.perSide).toEqual([25, 25, 10])
    expect(solvePlates(220, 20, METRIC)!.perSide).toEqual([25, 25, 25, 25])
  })
  it('target equal to the bar needs no plates', () => {
    expect(solvePlates(20, 20, METRIC)).toEqual({ perSide: [], remainderKg: 0, achievedKg: 20, barKg: 20 })
  })
  it('target below the bar cannot be loaded', () => {
    expect(solvePlates(19.99, 20, METRIC)).toBeNull()
    expect(solvePlates(0, 20, METRIC)).toBeNull()
    expect(solvePlates(-5, 20, METRIC)).toBeNull()
  })
  it('tolerates float noise just under the bar', () => {
    expect(solvePlates(20 - 1e-9, 20, METRIC)).not.toBeNull()
  })
  it('reports the remainder when the target is not reachable', () => {
    const r = solvePlates(101, 20, METRIC)! // 40.5 per side; smallest plate is 1.25
    expect(r.perSide).toEqual([25, 15])
    expect(r.remainderKg).toBeCloseTo(0.5, 9)
    expect(r.achievedKg).toBe(100)
  })
  it('handles fractional plates', () => {
    const r = solvePlates(62.5, 20, METRIC)!
    expect(r.perSide).toEqual([20, 1.25])
    expect(r.remainderKg).toBeCloseTo(0, 9)
    expect(r.achievedKg).toBeCloseTo(62.5, 9)
  })
  it('achievedKg is always bar + 2 * plates and remainder accounts for the rest', () => {
    for (const target of [20, 22.5, 47.5, 83.75, 100, 187.5, 301]) {
      const r = solvePlates(target, 20, METRIC)!
      expect(r.achievedKg + r.remainderKg * 2).toBeCloseTo(target, 9)
    }
  })
  it('ignores unsorted input, duplicates, zero and negative plates', () => {
    const r = solvePlates(100, 20, [5, 25, 0, -10, 15, 25, 10, 5])!
    expect(r.perSide).toEqual([25, 15])
  })
  it('no plates available: everything is remainder', () => {
    const r = solvePlates(60, 20, [])!
    expect(r.perSide).toEqual([])
    expect(r.remainderKg).toBe(20)
    expect(r.achievedKg).toBe(20)
  })
  it('works for pound plates converted to kg', () => {
    const lb = (x: number) => x / 2.20462262185
    const r = solvePlates(lb(225), lb(45), [45, 35, 25, 10, 5, 2.5].map(lb))!
    expect(r.perSide.map((p) => Math.round(p * 2.20462262185))).toEqual([45, 45])
    expect(r.remainderKg).toBeCloseTo(0, 6)
  })
  it('terminates on absurd targets', () => {
    const r = solvePlates(1_000_000, 20, [1])!
    expect(r.perSide.length).toBeLessThanOrEqual(41)
  })
  it('does not mutate its input', () => {
    const plates = [5, 25, 10]
    solvePlates(100, 20, plates)
    expect(plates).toEqual([5, 25, 10])
  })
})

describe('groupPlates', () => {
  it('groups with counts, heaviest first', () => {
    expect(groupPlates([25, 25, 10, 2.5, 2.5, 2.5])).toEqual([
      { plate: 25, count: 2 }, { plate: 10, count: 1 }, { plate: 2.5, count: 3 },
    ])
  })
  it('sorts even when input is unordered', () => {
    expect(groupPlates([5, 20, 5]).map((g) => g.plate)).toEqual([20, 5])
  })
  it('empty', () => expect(groupPlates([])).toEqual([]))
})

describe('presets', () => {
  it('each preset is sorted heaviest first with positive plates', () => {
    for (const p of PLATE_PRESETS) {
      expect(p.platesKg.length).toBeGreaterThan(0)
      expect([...p.platesKg].sort((a, b) => b - a)).toEqual(p.platesKg)
      expect(p.platesKg.every((x) => x > 0)).toBe(true)
    }
  })
  it('pound preset is built from 45 lb ~= 20.41 kg', () => {
    const lbs = PLATE_PRESETS.find((p) => p.label.startsWith('Pounds'))!
    expect(lbs.platesKg[0]).toBeCloseTo(20.4117, 3)
  })
  it('bar presets include the 20 kg Olympic bar and the 45 lb bar', () => {
    expect(BAR_PRESETS_KG).toContain(20)
    expect(BAR_PRESETS_KG.some((b) => Math.abs(b - 20.4117) < 0.001)).toBe(true)
  })
})
