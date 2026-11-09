import type { Workout } from '../db/types'

/** Set once the after-first-workout question has been answered either way. */
export const TRAINING_DAYS_ASKED_KEY = 'trana.trainingDaysAsked'

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** 0–6 in the order the person's week runs. */
export function orderedWeekdays(firstDayOfWeek: 0 | 1): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + firstDayOfWeek) % 7)
}

/** "Mon, Wed, Fri" in week order, or null when none are chosen. */
export function formatTrainingDays(days: number[], firstDayOfWeek: 0 | 1): string | null {
  if (days.length === 0) return null
  return orderedWeekdays(firstDayOfWeek)
    .filter((d) => days.includes(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ')
}

export function toggleDay(days: number[], day: number): number[] {
  return days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b)
}

function askedBefore(): boolean {
  try {
    return localStorage.getItem(TRAINING_DAYS_ASKED_KEY) === '1'
  } catch {
    return false
  }
}

export function markTrainingDaysAsked(): void {
  try {
    localStorage.setItem(TRAINING_DAYS_ASKED_KEY, '1')
  } catch {
    /* private mode: the question may come back, which is harmless */
  }
}

/** Only on the first-ever finish, and never again once answered or skipped. */
export function shouldAskTrainingDays(doneBefore: number | undefined, trainingDays: number[]): boolean {
  return doneBefore === 0 && trainingDays.length === 0 && !askedBefore()
}

export function daysBucket(days: number[]): '1-2' | '3-4' | '5+' | 'skipped' {
  if (days.length === 0) return 'skipped'
  if (days.length <= 2) return '1-2'
  if (days.length <= 4) return '3-4'
  return '5+'
}

/** Today is one of the chosen days and nothing has been logged today yet. */
export function trainingDayPending(days: number[], workouts: Workout[], now = Date.now()): boolean {
  const today = new Date(now)
  if (!days.includes(today.getDay())) return false
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return !workouts.some((w) => w.status === 'done' && w.startedAt >= midnight)
}
