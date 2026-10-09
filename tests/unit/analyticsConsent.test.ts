import { beforeEach, describe, expect, it, vi } from 'vitest'

const ph = vi.hoisted(() => ({
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
}))
vi.mock('posthog-js', () => ({ default: ph }))

// A key must exist for the module to do anything, and is read at import time.
vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test')

beforeEach(() => {
  vi.resetModules()
  Object.values(ph).forEach((f) => f.mockClear())
})

async function load() {
  return import('../../src/lib/analytics')
}

describe('analyticsAllowed', () => {
  it('needs both the switch and a recorded answer', async () => {
    const { analyticsAllowed } = await load()
    expect(analyticsAllowed({ analyticsEnabled: true, analyticsConsentAt: 5 })).toBe(true)
    // The old default: on, but nobody was ever asked.
    expect(analyticsAllowed({ analyticsEnabled: true, analyticsConsentAt: null })).toBe(false)
    expect(analyticsAllowed({ analyticsEnabled: false, analyticsConsentAt: 5 })).toBe(false)
    expect(analyticsAllowed({ analyticsEnabled: false, analyticsConsentAt: null })).toBe(false)
  })
})

describe('consent gates everything', () => {
  it('without a yes PostHog is never started and nothing is captured', async () => {
    const a = await load()
    a.syncAnalyticsConsent(false)
    a.track('workout_started', { from_routine: false })
    expect(ph.init).not.toHaveBeenCalled()
    expect(ph.capture).not.toHaveBeenCalled()
  })

  it('a yes starts it once and lets events through', async () => {
    const a = await load()
    a.syncAnalyticsConsent(true)
    a.syncAnalyticsConsent(true)
    a.track('workout_started', { from_routine: true })
    expect(ph.init).toHaveBeenCalledTimes(1)
    expect(ph.opt_in_capturing).toHaveBeenCalled()
    expect(ph.capture).toHaveBeenCalledWith('workout_started', { from_routine: true })
  })

  it('taking the yes back stops capture and discards the identifier', async () => {
    const a = await load()
    a.syncAnalyticsConsent(true)
    a.syncAnalyticsConsent(false)
    a.track('workout_started')
    expect(ph.opt_out_capturing).toHaveBeenCalled()
    expect(ph.reset).toHaveBeenCalled()
    expect(ph.capture).not.toHaveBeenCalled()
  })
})
