import { describe, expect, it } from 'vitest'
import { routePattern, sanitizeEventProperties } from '../../src/lib/analytics'

describe('routePattern', () => {
  it('replaces ids in the dynamic routes', () => {
    expect(routePattern('/history/3f2a-91')).toBe('/history/:id')
    expect(routePattern('/history/3f2a-91/edit')).toBe('/history/:id/edit')
    expect(routePattern('/exercises/bench-press-barbell')).toBe('/exercises/:id')
    expect(routePattern('/routines/abc')).toBe('/routines/:id')
  })

  it('leaves static routes alone', () => {
    for (const p of [
      '/',
      '/history',
      '/stats',
      '/exercises',
      '/measurements',
      '/settings',
      '/workout',
      '/routines/new',
    ]) {
      expect(routePattern(p)).toBe(p === '/routines/new' ? '/routines/:id' : p)
    }
  })

  it('handles a full URL under a base path, with query and hash', () => {
    expect(routePattern('https://x.github.io/workout-app/history/abc?x=1#top')).toBe(
      'https://x.github.io/workout-app/history/:id?x=1#top',
    )
    expect(routePattern('https://x.github.io/workout-app/exercises/squat-barbell')).toBe(
      'https://x.github.io/workout-app/exercises/:id',
    )
  })
})

describe('sanitizeEventProperties', () => {
  it('scrubs every URL property PostHog attaches and keeps the rest', () => {
    const out = sanitizeEventProperties({
      $current_url: 'https://x.github.io/workout-app/history/abc',
      $pathname: '/workout-app/history/abc/edit',
      $initial_current_url: 'https://x.github.io/workout-app/exercises/deadlift-barbell',
      $initial_pathname: '/workout-app/exercises/deadlift-barbell',
      $host: 'x.github.io',
      platform: 'ios',
    })
    expect(out).toEqual({
      $current_url: 'https://x.github.io/workout-app/history/:id',
      $pathname: '/workout-app/history/:id/edit',
      $initial_current_url: 'https://x.github.io/workout-app/exercises/:id',
      $initial_pathname: '/workout-app/exercises/:id',
      $host: 'x.github.io',
      platform: 'ios',
    })
  })
})
