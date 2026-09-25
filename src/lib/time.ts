/** "1:05:32" for long durations, "5:32" for short ones. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes)
  return hours > 0
    ? `${hours}:${mm}:${String(seconds).padStart(2, '0')}`
    : `${mm}:${String(seconds).padStart(2, '0')}`
}

/** Compact form for history rows: "1h 12m", "48m". */
export function formatDurationShort(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.round((s % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/**
 * Cumulative totals in hours: "39.5h", "6.2h", "45m".
 * Compact enough for a stat tile, where "39h 31m" wraps onto two lines.
 */
export function formatHoursTotal(totalSeconds: number): string {
  const hours = totalSeconds / 3600
  if (hours < 1) return `${Math.round(totalSeconds / 60)}m`
  return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)}h`
}

/** Parses "90", "1:30", or "1:30:00" into seconds. */
export function parseDuration(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const parts = trimmed.split(':')
  if (parts.some((p) => p !== '' && !/^\d+$/.test(p))) return null
  const nums = parts.map((p) => (p === '' ? 0 : Number(p)))
  if (nums.length === 1) return nums[0]
  if (nums.length === 2) return nums[0] * 60 + nums[1]
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2]
  return null
}

const DAY_MS = 86400000

/** "Today", "Yesterday", "Mon, 12 May" or "12 May 2024" for older dates. */
export function formatDateLabel(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const startOf = (t: number) => {
    const x = new Date(t)
    x.setHours(0, 0, 0, 0)
    return x.getTime()
  }
  const days = Math.round((startOf(now) - startOf(ts)) / DAY_MS)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, {
    weekday: sameYear && days < 7 ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
}

export function formatTimeOfDay(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Elapsed time since a first event, as a "training age": "18d", "5mo",
 * "2y 3mo". Coarsens as it grows, the same way `formatRelative` does, so a
 * three-year history reads as "3y 1mo" rather than "1127d".
 */
export function formatAge(days: number): string {
  const d = Math.max(0, Math.floor(days))
  if (d < 30) return `${d}d`
  if (d < 365) return `${Math.round(d / 30)}mo`
  let years = Math.floor(d / 365)
  let months = Math.round((d % 365) / 30)
  if (months === 12) {
    years += 1
    months = 0
  }
  return months > 0 ? `${years}y ${months}mo` : `${years}y`
}

/** "3d ago", "2w ago", "5mo ago" — used for "last performed" hints. */
export function formatRelative(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts)
  const days = Math.floor(diff / DAY_MS)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 31) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}
