import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dismissSplash } from '../../src/lib/splash'

/** The unit environment is node, so stand in the few DOM pieces the splash touches. */
function stubDom(quick: boolean) {
  const classes = new Set(quick ? ['quick'] : [])
  const el = {
    classList: {
      contains: (c: string) => classes.has(c),
      add: (c: string) => void classes.add(c),
    },
    remove: vi.fn(),
  }
  const store = new Map<string, string>()
  vi.stubGlobal('document', {
    getElementById: (id: string) => (id === 'splash' ? el : null),
    querySelector: () => null,
  })
  vi.stubGlobal('window', {
    __splashAt: performance.now(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  })
  return { el, store }
}

describe('dismissSplash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('first launch holds the full splash, then remembers it was seen', () => {
    const { el, store } = stubDom(false)
    dismissSplash()
    vi.advanceTimersByTime(1000)
    expect(el.classList.contains('leaving')).toBe(false)
    vi.advanceTimersByTime(400)
    expect(el.classList.contains('leaving')).toBe(true)
    expect(store.get('trana.splashSeen')).toBe('1')
  })

  it('returning launch fades after a short hold', () => {
    const { el } = stubDom(true)
    dismissSplash()
    vi.advanceTimersByTime(200)
    expect(el.classList.contains('leaving')).toBe(true)
  })
})
