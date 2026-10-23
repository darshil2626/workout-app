import { describe, expect, it, vi } from 'vitest'
import {
  buildPayload,
  feedbackMode,
  mailtoUrl,
  submitFeedback,
  validateFeedback,
  type DeviceInfo,
  type FeedbackFields,
} from '../../src/lib/feedback'

const fields = (over: Partial<FeedbackFields> = {}): FeedbackFields => ({
  happened: 'The timer froze',
  expected: '',
  email: '',
  rating: null,
  includeDeviceInfo: true,
  ...over,
})
const device: DeviceInfo = {
  build: 'abc123',
  platform: 'iPhone',
  installed: true,
  userAgent: 'UA',
  language: 'en-GB',
  viewport: '390x844',
}

describe('feedback config', () => {
  it('is disabled by default and for anything that is not mailto or https', () => {
    expect(feedbackMode('')).toBe('disabled')
    expect(feedbackMode('http://insecure.example')).toBe('disabled')
    expect(feedbackMode('someone@example.com')).toBe('disabled')
    expect(feedbackMode('mailto:me@example.com')).toBe('mailto')
    expect(feedbackMode('https://formspree.io/f/xyz')).toBe('post')
  })
})

describe('validateFeedback', () => {
  it('needs the main message, and an email that looks like one if given', () => {
    expect(validateFeedback(fields({ happened: '  ' }))).toMatch(/what happened/i)
    expect(validateFeedback(fields({ email: 'nope' }))).toMatch(/email/i)
    expect(validateFeedback(fields({ email: 'a@b.co' }))).toBeNull()
    expect(validateFeedback(fields())).toBeNull()
  })
})

describe('buildPayload', () => {
  it('holds only the form and the device facts, and omits blanks and unticked device info', () => {
    const p = buildPayload(fields({ rating: 4, email: ' a@b.co ' }), device)
    expect(p).toEqual({ happened: 'The timer froze', expected: '', email: 'a@b.co', rating: 4, device })
    expect(Object.keys(buildPayload(fields({ includeDeviceInfo: false }), device))).toEqual(['happened', 'expected'])
  })
})

describe('submitFeedback', () => {
  const p = buildPayload(fields(), device)
  it('does nothing when not configured', async () => {
    expect(await submitFeedback(p, { endpoint: '' })).toEqual({ ok: false, reason: 'not-configured' })
  })
  it('opens a filled-in mail for mailto', async () => {
    const open = vi.fn()
    expect(await submitFeedback(p, { endpoint: 'mailto:me@example.com', open })).toEqual({ ok: true, via: 'mailto' })
    const url = open.mock.calls[0][0] as string
    expect(url).toMatch(/^mailto:me@example\.com\?subject=/)
    expect(decodeURIComponent(url)).toContain('The timer froze')
    expect(url).toBe(mailtoUrl('mailto:me@example.com', p))
  })
  it('posts JSON to a form service and reports failure honestly', async () => {
    const post = vi.fn().mockResolvedValue(200)
    expect(await submitFeedback(p, { endpoint: 'https://x.example/f', post })).toEqual({ ok: true, via: 'post' })
    expect(JSON.parse(post.mock.calls[0][1] as string).what_happened).toBe('The timer froze')
    expect(await submitFeedback(p, { endpoint: 'https://x.example/f', post: async () => 500 })).toEqual({
      ok: false,
      reason: 'failed',
    })
    expect(await submitFeedback(p, { endpoint: 'https://x.example/f', post: async () => 429 })).toEqual({
      ok: false,
      reason: 'rate-limited',
    })
    expect(await submitFeedback(p, { endpoint: 'https://x.example/f', post: async () => 400 })).toEqual({
      ok: false,
      reason: 'rejected',
    })
    expect(
      await submitFeedback(p, {
        endpoint: 'https://x.example/f',
        post: async () => {
          throw new Error('offline')
        },
      }),
    ).toEqual({ ok: false, reason: 'failed' })
  })
})
