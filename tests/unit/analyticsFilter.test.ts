import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ALLOWED_EVENTS, filterOutgoingEvent } from '../../src/lib/analytics'

describe('filterOutgoingEvent', () => {
  it('lets the app’s own events through', () => {
    for (const name of ['app_opened', 'workout_completed', '$pageview', '$opt_in']) {
      const e = { event: name, properties: { platform: 'ios' } }
      expect(filterOutgoingEvent(e)).toBe(e)
    }
  })

  it.each([
    '$dead_click',
    '$dead_swipe',
    '$rageclick',
    '$autocapture',
    '$exception',
    '$$heatmap',
    '$web_vitals',
    '$pageleave',
    '$identify',
    '$groupidentify',
    '$snapshot',
    'something_new_the_library_invents',
  ])('drops %s, so a library feature cannot add its own data', (name) => {
    expect(filterOutgoingEvent({ event: name, properties: { $el_text: 'Bench Press (Barbell)' } })).toBeNull()
  })

  it('drops a missing event', () => {
    expect(filterOutgoingEvent(null)).toBeNull()
  })

  it('scrubs ids from every URL the event carries, including person property bags', () => {
    const out = filterOutgoingEvent({
      event: '$pageview',
      properties: {
        $current_url: 'https://x.github.io/workout-app/history/abc',
        $pathname: '/workout-app/history/abc',
      },
      $set: { $current_url: 'https://x.github.io/workout-app/exercises/squat-barbell' },
      $set_once: { $initial_pathname: '/workout-app/routines/xyz' },
    })
    expect(out?.properties).toEqual({
      $current_url: 'https://x.github.io/workout-app/history/:id',
      $pathname: '/workout-app/history/:id',
    })
    expect(out?.$set).toEqual({ $current_url: 'https://x.github.io/workout-app/exercises/:id' })
    expect(out?.$set_once).toEqual({ $initial_pathname: '/workout-app/routines/:id' })
  })
})

describe('the allowlist matches the code', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name)
      if (d.isDirectory()) walk(p, out)
      else if (/\.(ts|tsx)$/.test(d.name)) out.push(p)
    }
    return out
  }

  it('every event name passed to track() is allowed, so none is silently dropped', () => {
    const used = new Set<string>()
    for (const file of walk(join(__dirname, '..', '..', 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\btrack\(\s*'([a-z_]+)'/g)) used.add(m[1])
    }
    expect(used.size).toBeGreaterThan(10)
    const missing = [...used].filter((n) => !ALLOWED_EVENTS.has(n))
    expect(missing).toEqual([])
  })

  it('lists nothing that is not documented as sent', () => {
    const privacy = readFileSync(join(__dirname, '..', '..', 'PRIVACY.md'), 'utf8')
    const undocumented = [...ALLOWED_EVENTS].filter((n) => !privacy.includes(n))
    expect(undocumented).toEqual([])
  })
})
