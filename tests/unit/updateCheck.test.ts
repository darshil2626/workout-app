import { describe, expect, it, vi } from 'vitest'
import { MIN_GAP_MS, UPDATE_CHECK_INTERVAL_MS, watchForUpdates } from '../../src/lib/updateCheck'

/** The unit environment is node, so stand in the page, the network flag and the clock. */
function setup({ online = true, installing = false } = {}) {
  let now = 1_000_000
  let visibility: DocumentVisibilityState = 'hidden'
  const listeners = new Set<() => void>()
  let tick: (() => void) | undefined
  const reg = {
    update: vi.fn(() => Promise.resolve(undefined as never)),
    installing: installing ? ({} as ServiceWorker) : null,
  }
  const env = {
    document: {
      get visibilityState() {
        return visibility
      },
      addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
    } as unknown as Document,
    navigator: { onLine: online },
    setInterval: vi.fn((fn: () => void) => {
      tick = fn
      return 1
    }),
    clearInterval: vi.fn(),
    now: () => now,
  }
  const stop = watchForUpdates(reg, env)
  return {
    reg,
    env,
    stop,
    listeners,
    resume: () => {
      visibility = 'visible'
      listeners.forEach((fn) => fn())
    },
    hide: () => {
      visibility = 'hidden'
      listeners.forEach((fn) => fn())
    },
    tick: () => tick?.(),
    advance: (ms: number) => void (now += ms),
  }
}

describe('watchForUpdates', () => {
  it('checks for an update when the app comes back to the screen', () => {
    const s = setup()
    s.resume()
    expect(s.reg.update).toHaveBeenCalledTimes(1)
  })

  it('does not check when the app goes to the background', () => {
    const s = setup()
    s.hide()
    expect(s.reg.update).not.toHaveBeenCalled()
  })

  it('checks on a timer while the app stays open', () => {
    const s = setup()
    expect(s.env.setInterval).toHaveBeenCalledWith(expect.any(Function), UPDATE_CHECK_INTERVAL_MS)
    s.tick()
    expect(s.reg.update).toHaveBeenCalledTimes(1)
  })

  it('does not check again when the app is flicked away and back within a minute', () => {
    const s = setup()
    s.resume()
    s.hide()
    s.advance(MIN_GAP_MS - 1)
    s.resume()
    expect(s.reg.update).toHaveBeenCalledTimes(1)
    s.advance(1)
    s.hide()
    s.resume()
    expect(s.reg.update).toHaveBeenCalledTimes(2)
  })

  it('skips the check while offline or while an update is already downloading', () => {
    const offline = setup({ online: false })
    offline.resume()
    expect(offline.reg.update).not.toHaveBeenCalled()
    const installing = setup({ installing: true })
    installing.resume()
    expect(installing.reg.update).not.toHaveBeenCalled()
  })

  it('swallows a failed check so it can try again later', async () => {
    const s = setup()
    s.reg.update.mockReturnValueOnce(Promise.reject(new Error('network')))
    s.resume()
    await Promise.resolve()
    s.advance(MIN_GAP_MS)
    s.tick()
    expect(s.reg.update).toHaveBeenCalledTimes(2)
  })

  it('stops listening and clears the timer when stopped', () => {
    const s = setup()
    s.stop()
    expect(s.listeners.size).toBe(0)
    expect(s.env.clearInterval).toHaveBeenCalledWith(1)
  })
})
