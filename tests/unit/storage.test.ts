import { describe, expect, it } from 'vitest'
import { isQuotaError } from '../../src/lib/storage'

function named(name: string, inner?: unknown): Error {
  const e = new Error(name) as Error & { inner?: unknown }
  e.name = name
  if (inner !== undefined) e.inner = inner
  return e
}

describe('isQuotaError', () => {
  it('recognises the DOM quota exception', () => {
    expect(isQuotaError(named('QuotaExceededError'))).toBe(true)
  })

  it('sees through a Dexie wrapper', () => {
    expect(isQuotaError(named('AbortError', named('QuotaExceededError')))).toBe(true)
  })

  it('ignores other errors and non-errors', () => {
    expect(isQuotaError(named('TypeError'))).toBe(false)
    expect(isQuotaError(named('AbortError', named('TypeError')))).toBe(false)
    expect(isQuotaError('QuotaExceededError')).toBe(false)
    expect(isQuotaError(undefined)).toBe(false)
  })
})
