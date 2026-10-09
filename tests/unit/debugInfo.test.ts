import { describe, expect, it } from 'vitest'
import { formatDebugInfo, getRecentErrors, recordRecentError, type DebugSnapshot } from '../../src/lib/debugInfo'

function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  }
}

describe('recent errors', () => {
  it('records the failure kind and the error class, never the message', () => {
    const store = memoryStore()
    recordRecentError('unhandledrejection', new TypeError('Bench Press 100kg exploded'), 1000, store)
    const saved = getRecentErrors(store)
    expect(saved).toEqual([{ at: 1000, kind: 'unhandledrejection', name: 'TypeError' }])
    expect(JSON.stringify(saved)).not.toContain('Bench')
  })

  it('keeps only the last ten', () => {
    const store = memoryStore()
    for (let i = 0; i < 15; i++) recordRecentError('error', new Error('x'), i, store)
    const saved = getRecentErrors(store)
    expect(saved).toHaveLength(10)
    expect(saved[0].at).toBe(5)
    expect(saved[9].at).toBe(14)
  })

  it('survives corrupt storage and a missing store', () => {
    const store = memoryStore()
    store.setItem('trana_recent_errors', '{not json')
    expect(getRecentErrors(store)).toEqual([])
    expect(() => recordRecentError('error', new Error('x'), 1, null)).not.toThrow()
  })

  it('names a thrown non-error by its type only', () => {
    const store = memoryStore()
    recordRecentError('error', 'secret string', 1, store)
    expect(getRecentErrors(store)[0].name).toBe('string')
  })
})

describe('formatDebugInfo', () => {
  const base: DebugSnapshot = {
    build: '2026-10-09 12:00 · abc1234',
    databaseVersion: 40,
    counts: { workouts: 145, routines: 22 },
    platform: 'ios',
    standalone: true,
    online: false,
    userAgent: 'UA',
    language: 'en-GB',
    storage: { persisted: true, usedMB: 3, quotaMB: 900 },
    recentErrors: [{ at: 0, kind: 'render_error', name: 'TypeError' }],
  }

  it('lays out the facts a bug report needs', () => {
    const text = formatDebugInfo(base)
    expect(text).toContain('Build: 2026-10-09 12:00 · abc1234')
    expect(text).toContain('Database version: 40')
    expect(text).toContain('Stored: 145 workouts, 22 routines')
    expect(text).toContain('Platform: ios, installed, offline')
    expect(text).toContain('persistent true, 3 MB of 900 MB')
    expect(text).toContain('1970-01-01T00:00:00.000Z render_error TypeError')
  })

  it('reports the database error when counts could not be read', () => {
    const text = formatDebugInfo({ ...base, counts: null, databaseError: 'VersionError', databaseVersion: null })
    expect(text).toContain('Database error: VersionError')
    expect(text).toContain('Database version: unknown')
    expect(text).not.toContain('Stored:')
  })
})
