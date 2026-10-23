/**
 * In-app feedback. One place decides where a submission goes.
 *
 * FEEDBACK_ENDPOINT is one of:
 *   - ''                         not configured: the form says so and cannot send
 *   - 'mailto:you@example.com'   opens the person's mail app with the message filled in
 *   - 'https://...'              a form service that takes a JSON POST (Web3Forms below)
 *
 * The Web3Forms access key is public by design: it can only submit to the
 * owner's inbox and is meant to sit in client code.
 */
export const FEEDBACK_ENDPOINT = 'https://api.web3forms.com/submit'
export const FEEDBACK_ACCESS_KEY = 'dd0ac32e-e12b-48f5-8a8e-c8ca3bcef901'

export type FeedbackMode = 'disabled' | 'mailto' | 'post'

export function feedbackMode(endpoint: string = FEEDBACK_ENDPOINT): FeedbackMode {
  const e = endpoint.trim()
  if (e === '') return 'disabled'
  if (/^mailto:/i.test(e)) return 'mailto'
  if (/^https:\/\//i.test(e)) return 'post'
  return 'disabled'
}

export interface FeedbackFields {
  happened: string
  expected: string
  email: string
  /** 1-5, or null when not given. */
  rating: number | null
  includeDeviceInfo: boolean
}

/** Facts about the app and device. Nothing from a workout, routine or measurement. */
export interface DeviceInfo {
  build: string
  platform: string
  installed: boolean
  userAgent: string
  language: string
  viewport: string
}

export interface FeedbackPayload {
  happened: string
  expected: string
  email?: string
  rating?: number
  device?: DeviceInfo
}

export function validateFeedback(f: FeedbackFields): string | null {
  if (f.happened.trim() === '') return 'Tell me what happened.'
  if (f.email.trim() !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) {
    return 'That email address does not look right. Leave it blank if you would rather not share one.'
  }
  return null
}

export function buildPayload(f: FeedbackFields, device: DeviceInfo | null): FeedbackPayload {
  return {
    happened: f.happened.trim(),
    expected: f.expected.trim(),
    ...(f.email.trim() ? { email: f.email.trim() } : {}),
    ...(f.rating !== null ? { rating: f.rating } : {}),
    ...(f.includeDeviceInfo && device ? { device } : {}),
  }
}

export function mailtoUrl(endpoint: string, p: FeedbackPayload): string {
  const to = endpoint.trim().replace(/^mailto:/i, '')
  const lines = [
    `What happened:\n${p.happened}`,
    p.expected ? `What I expected:\n${p.expected}` : '',
    p.rating ? `Rating: ${p.rating}/5` : '',
    p.email ? `Reply to: ${p.email}` : '',
    p.device
      ? `Build: ${p.device.build}\nPlatform: ${p.device.platform}${p.device.installed ? ' (installed)' : ''}\nBrowser: ${p.device.userAgent}\nLanguage: ${p.device.language}\nViewport: ${p.device.viewport}`
      : '',
  ].filter(Boolean)
  return `mailto:${to}?subject=${encodeURIComponent('Trana feedback')}&body=${encodeURIComponent(lines.join('\n\n'))}`
}

export type SubmitResult =
  | { ok: true; via: 'mailto' | 'post' }
  | { ok: false; reason: 'not-configured' | 'failed' | 'rate-limited' | 'rejected' }

/** The JSON body Web3Forms expects: reserved names plus the rest forwarded as-is. */
export function web3formsBody(p: FeedbackPayload, accessKey: string = FEEDBACK_ACCESS_KEY): Record<string, unknown> {
  return {
    access_key: accessKey,
    subject: 'Trana feedback',
    from_name: 'Trana feedback form',
    ...(p.email ? { email: p.email } : {}),
    // Spam trap: real people never fill this, and it is hidden on the page.
    botcheck: false,
    what_happened: p.happened,
    ...(p.expected ? { what_they_expected: p.expected } : {}),
    ...(p.rating ? { rating: `${p.rating}/5` } : {}),
    ...(p.device
      ? {
          build: p.device.build,
          platform: p.device.platform,
          installed: p.device.installed,
          browser: p.device.userAgent,
          language: p.device.language,
          viewport: p.device.viewport,
        }
      : {}),
  }
}

/** Sends a submission. `open` and `post` are injectable so tests need no network or mail app. */
export async function submitFeedback(
  p: FeedbackPayload,
  options: {
    endpoint?: string
    open?: (url: string) => void
    /** Resolves to the HTTP status. */
    post?: (url: string, body: string) => Promise<number>
  } = {},
): Promise<SubmitResult> {
  const endpoint = options.endpoint ?? FEEDBACK_ENDPOINT
  const mode = feedbackMode(endpoint)
  if (mode === 'disabled') return { ok: false, reason: 'not-configured' }
  if (mode === 'mailto') {
    ;(options.open ?? ((url) => void (window.location.href = url)))(mailtoUrl(endpoint, p))
    return { ok: true, via: 'mailto' }
  }
  const post =
    options.post ??
    (async (url, body) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body,
      })
      // Web3Forms reports a refusal in the body too, so a 200 with success:false is not a send.
      if (res.ok) {
        const json = (await res.json().catch(() => null)) as { success?: boolean } | null
        if (json && json.success === false) return 400
      }
      return res.status
    })
  try {
    const status = await post(endpoint, JSON.stringify(web3formsBody(p)))
    if (status >= 200 && status < 300) return { ok: true, via: 'post' }
    if (status === 429) return { ok: false, reason: 'rate-limited' }
    if (status >= 400 && status < 500) return { ok: false, reason: 'rejected' }
    return { ok: false, reason: 'failed' }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

export function readDeviceInfo(): DeviceInfo {
  const nav = typeof navigator === 'undefined' ? null : navigator
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (nav as unknown as { standalone?: boolean } | null)?.standalone === true
  return {
    build: __BUILD_ID__,
    platform: nav?.platform ?? 'unknown',
    installed: Boolean(standalone),
    userAgent: nav?.userAgent ?? 'unknown',
    language: nav?.language ?? 'unknown',
    viewport: typeof window === 'undefined' ? 'unknown' : `${window.innerWidth}x${window.innerHeight}`,
  }
}
