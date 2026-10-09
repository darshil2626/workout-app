import { describe, expect, it } from 'vitest'
import {
  formatAge,
  formatDateLabel,
  formatDuration,
  formatDurationShort,
  formatHoursTotal,
  formatRelative,
  formatTimeOfDay,
  parseDuration,
} from '../../src/lib/time'

const DAY = 86_400_000
// Local-time constructor so results do not depend on the machine's timezone.
const local = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime()

describe('formatDuration', () => {
  it('short and long forms', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(5)).toBe('0:05')
    expect(formatDuration(332)).toBe('5:32')
    expect(formatDuration(3599)).toBe('59:59')
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDuration(3932)).toBe('1:05:32')
    expect(formatDuration(36000)).toBe('10:00:00')
  })
  it('floors fractions and clamps negatives', () => {
    expect(formatDuration(59.9)).toBe('0:59')
    expect(formatDuration(-10)).toBe('0:00')
  })
})

describe('formatDurationShort', () => {
  it('formats minutes, hours and mixed', () => {
    expect(formatDurationShort(0)).toBe('0m')
    expect(formatDurationShort(48 * 60)).toBe('48m')
    expect(formatDurationShort(3600)).toBe('1h')
    expect(formatDurationShort(72 * 60)).toBe('1h 12m')
    expect(formatDurationShort(-5)).toBe('0m')
  })
  it('rounds minutes', () => {
    expect(formatDurationShort(89)).toBe('1m') // 1.48 -> 1
    expect(formatDurationShort(91)).toBe('2m')
  })
})

describe('formatHoursTotal', () => {
  it('uses minutes under an hour', () => {
    expect(formatHoursTotal(0)).toBe('0m')
    expect(formatHoursTotal(45 * 60)).toBe('45m')
  })
  it('one decimal under 10h, whole hours after', () => {
    expect(formatHoursTotal(3600)).toBe('1.0h')
    expect(formatHoursTotal(6.2 * 3600)).toBe('6.2h')
    expect(formatHoursTotal(39.5 * 3600)).toBe('40h')
    expect(formatHoursTotal(39.4 * 3600)).toBe('39h')
    expect(formatHoursTotal(10 * 3600)).toBe('10h')
  })
})

describe('parseDuration', () => {
  it('parses seconds, m:s, h:m:s', () => {
    expect(parseDuration('90')).toBe(90)
    expect(parseDuration('1:30')).toBe(90)
    expect(parseDuration('1:30:00')).toBe(5400)
    expect(parseDuration('0:05')).toBe(5)
    expect(parseDuration('2:00:05')).toBe(7205)
  })
  it('trims whitespace', () => expect(parseDuration('  1:30 ')).toBe(90))
  it('treats empty segments as zero', () => {
    expect(parseDuration(':30')).toBe(30)
    expect(parseDuration('1:')).toBe(60)
  })
  it('rejects bad input', () => {
    expect(parseDuration('')).toBeNull()
    expect(parseDuration('   ')).toBeNull()
    expect(parseDuration('abc')).toBeNull()
    expect(parseDuration('1:2:3:4')).toBeNull()
    expect(parseDuration('-5')).toBeNull()
    expect(parseDuration('1.5')).toBeNull()
    expect(parseDuration('1:xx')).toBeNull()
  })
  it('round trips with formatDuration', () => {
    for (const s of [0, 59, 60, 332, 3599, 3600, 3932, 86399]) expect(parseDuration(formatDuration(s))).toBe(s)
  })
})

describe('formatDateLabel', () => {
  const now = local(2026, 10, 9, 15, 0) // Friday
  it('Today / Yesterday regardless of time of day', () => {
    expect(formatDateLabel(local(2026, 10, 9, 0, 1), now)).toBe('Today')
    expect(formatDateLabel(local(2026, 10, 9, 23, 59), now)).toBe('Today')
    expect(formatDateLabel(local(2026, 10, 8, 23, 59), now)).toBe('Yesterday')
    expect(formatDateLabel(local(2026, 10, 8, 0, 0), now)).toBe('Yesterday')
  })
  it('midnight boundary: 23:59 vs 00:01 are different days', () => {
    const justAfterMidnight = local(2026, 10, 10, 0, 1)
    expect(formatDateLabel(local(2026, 10, 9, 23, 59), justAfterMidnight)).toBe('Yesterday')
  })
  it('recent same-year dates include a short weekday, no year', () => {
    const label = formatDateLabel(local(2026, 10, 6), now) // Tuesday, 3 days ago
    expect(label).toMatch(/Tue/)
    expect(label).toMatch(/Oct/)
    expect(label).not.toMatch(/2026/)
  })
  it('same-year dates a week or more ago drop the weekday', () => {
    const label = formatDateLabel(local(2026, 9, 25), now)
    expect(label).toMatch(/Sep/)
    expect(label).not.toMatch(/Fri|Thu|Sat/)
    expect(label).not.toMatch(/2026/)
  })
  it('6 days ago still has weekday, 7 days ago does not', () => {
    expect(formatDateLabel(local(2026, 10, 3), now)).toMatch(/Sat/)
    expect(formatDateLabel(local(2026, 10, 2), now)).not.toMatch(/Fri/)
  })
  it('other years include the year', () => {
    const label = formatDateLabel(local(2024, 5, 12), now)
    expect(label).toMatch(/2024/)
    expect(label).toMatch(/May/)
  })
  it('a date across New Year is previous year', () => {
    const ny = local(2026, 1, 2)
    expect(formatDateLabel(local(2025, 12, 31), ny)).toMatch(/2025/)
  })
})

describe('formatTimeOfDay', () => {
  it('renders hour and minute', () => {
    expect(formatTimeOfDay(local(2026, 1, 1, 14, 5))).toMatch(/^(2:05|14:05)/)
  })
})

describe('formatAge', () => {
  it('days under 30', () => {
    expect(formatAge(0)).toBe('0d')
    expect(formatAge(18)).toBe('18d')
    expect(formatAge(29)).toBe('29d')
    expect(formatAge(-4)).toBe('0d')
    expect(formatAge(18.9)).toBe('18d')
  })
  it('months until a year', () => {
    expect(formatAge(30)).toBe('1mo')
    expect(formatAge(150)).toBe('5mo')
  })
  it('years and months', () => {
    expect(formatAge(365)).toBe('1y')
    expect(formatAge(365 + 90)).toBe('1y 3mo')
    expect(formatAge(2 * 365 + 90)).toBe('2y 3mo')
  })
  it('carries 12 months into a year', () => {
    expect(formatAge(2 * 365 - 1)).toBe('2y')
  })
})

describe('formatRelative', () => {
  const now = 1_800_000_000_000
  it('today / yesterday', () => {
    expect(formatRelative(now, now)).toBe('today')
    expect(formatRelative(now - DAY + 1, now)).toBe('today')
    expect(formatRelative(now - DAY, now)).toBe('yesterday')
  })
  it('future timestamps clamp to today', () => expect(formatRelative(now + 5 * DAY, now)).toBe('today'))
  it('days, weeks, months, years boundaries', () => {
    expect(formatRelative(now - 2 * DAY, now)).toBe('2d ago')
    expect(formatRelative(now - 6 * DAY, now)).toBe('6d ago')
    expect(formatRelative(now - 7 * DAY, now)).toBe('1w ago')
    expect(formatRelative(now - 30 * DAY, now)).toBe('4w ago')
    expect(formatRelative(now - 31 * DAY, now)).toBe('1mo ago')
    expect(formatRelative(now - 364 * DAY, now)).toBe('12mo ago')
    expect(formatRelative(now - 365 * DAY, now)).toBe('1y ago')
    expect(formatRelative(now - 800 * DAY, now)).toBe('2y ago')
  })
})
