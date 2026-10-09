import { describe, expect, it } from 'vitest'
import { unsupportedReasons } from '../../src/lib/support'

const OK = { hasIndexedDb: true, hasColorMix: true, hasIntersectionObserver: true }

describe('unsupportedReasons', () => {
  it('passes a capable browser', () => {
    expect(unsupportedReasons(OK)).toEqual([])
  })

  it('names each missing capability in plain words', () => {
    expect(unsupportedReasons({ ...OK, hasColorMix: false })).toEqual(['it is too old to draw the app’s colours'])
    expect(unsupportedReasons({ ...OK, hasIndexedDb: false })[0]).toMatch(/store data/)
    expect(
      unsupportedReasons({ hasIndexedDb: false, hasColorMix: false, hasIntersectionObserver: false }),
    ).toHaveLength(3)
  })
})
