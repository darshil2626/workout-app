import posthog from 'posthog-js'

/**
 * Usage metrics only — never workout content. Every capture() call site in
 * this app passes bucketed/categorical properties, never exercise names,
 * weights, reps, routine names or measurements. Content stays in IndexedDB
 * and is never touched by this module.
 */

const apiKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined

let initialized = false

function ensureInit() {
  if (initialized || !apiKey) return
  posthog.init(apiKey, {
    api_host: 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: true,
    persistence: 'localStorage',
    sanitize_properties: (properties) => sanitizeEventProperties(properties),
  })
  initialized = true
}

/** Called once settings have loaded, and again whenever the toggle changes. */
export function syncAnalyticsConsent(enabled: boolean): void {
  if (!apiKey) return
  ensureInit()
  if (enabled) posthog.opt_in_capturing()
  else posthog.opt_out_capturing()
}

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  if (!apiKey || !initialized) return
  posthog.capture(event, properties)
}

/**
 * The route a path matched, with ids swapped for placeholders. A raw path like
 * /history/<workout-id> or /exercises/bench-press-barbell would say which
 * session or lift someone opened, which is exactly the content this module
 * promises never to send. Works on a bare path or a full URL, and on a path
 * under a base such as /workout-app/.
 */
export function routePattern(path: string): string {
  return path
    .replace(/\/history\/[^/?#]+\/edit(?=$|[?#])/, '/history/:id/edit')
    .replace(/\/history\/[^/?#]+(?=$|[?#])/, '/history/:id')
    .replace(/\/exercises\/[^/?#]+(?=$|[?#])/, '/exercises/:id')
    .replace(/\/routines\/[^/?#]+(?=$|[?#])/, '/routines/:id')
}

/** PostHog adds the page's real URL to every event under these names. */
const URL_PROPERTIES = ['$current_url', '$pathname', '$initial_current_url', '$initial_pathname']

/**
 * Runs on every event just before it is sent, so no event can carry an id in
 * its URL, whichever call produced it or whatever PostHog attaches by default.
 */
export function sanitizeEventProperties(properties: Record<string, unknown>): Record<string, unknown> {
  for (const key of URL_PROPERTIES) {
    const value = properties[key]
    if (typeof value === 'string') properties[key] = routePattern(value)
  }
  return properties
}

export function trackPageview(path: string): void {
  track('$pageview', { $current_url: routePattern(path) })
}

export function isStandalonePwa(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari's legacy flag; there's no display-mode support there.
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

export function detectPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = window.navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

function bucket(value: number, edges: number[]): string {
  for (let i = 0; i < edges.length; i++) {
    if (value < edges[i]) return i === 0 ? `<${edges[i]}` : `${edges[i - 1]}-${edges[i]}`
  }
  return `${edges[edges.length - 1]}+`
}

export const bucketDurationMinutes = (minutes: number) => bucket(minutes, [15, 30, 45, 60, 90])
export const bucketSetCount = (sets: number) => bucket(sets, [10, 15, 20, 30])
