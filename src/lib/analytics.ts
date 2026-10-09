import type { PostHog } from 'posthog-js'

/**
 * Usage metrics only — never workout content. Every capture() call site in
 * this app passes bucketed/categorical properties, never exercise names,
 * weights, reps, routine names or measurements. Content stays in IndexedDB
 * and is never touched by this module.
 *
 * The PostHog library is a large part of the app's weight, and most people will
 * not opt in, so it is fetched only after someone says yes.
 */

const apiKey = import.meta.env.VITE_POSTHOG_KEY as string | undefined

let client: PostHog | null = null
let loading: Promise<void> | null = null
/** Whether the person has said yes. Nothing is captured, or even set up, otherwise. */
let allowed = false
/** Events raised while the library was still downloading, sent once it is ready. */
let pending: Array<[string, Record<string, string | number | boolean> | undefined]> = []
/** A runaway loop must not grow this without bound while offline. */
const MAX_PENDING = 50

/**
 * Every event the app sends, by name. PostHog also has features that raise their
 * own events (dead clicks, rage clicks, exceptions, heatmaps, web vitals), and
 * several of them attach the visible text or markup of what was tapped, which in
 * this app can be a workout or exercise name. Those are not on this list, so they
 * are dropped before leaving the device, whatever the library or its server-side
 * settings decide. Add a name here when adding a `track()` call, and to PRIVACY.md.
 */
export const ALLOWED_EVENTS: ReadonlySet<string> = new Set([
  'app_opened',
  'workout_started',
  'workout_completed',
  'routine_created',
  'backup_exported',
  'backup_imported',
  'backup_restore_undone',
  'csv_import_used',
  'history_cleanup_run',
  'exercise_match_run',
  'theme_changed',
  'pwa_install_prompt_shown',
  'pwa_install_accepted',
  'pwa_install_dismissed',
  'render_error',
  'unhandled_error',
  'storage_persist',
  // The library's own, and needed: one page view per screen, and the opt-in marker.
  '$pageview',
  '$opt_in',
])

/** What PostHog hands `before_send`: the event name and its property bags. */
interface OutgoingEvent {
  event: string
  properties?: Record<string, unknown>
  $set?: Record<string, unknown>
  $set_once?: Record<string, unknown>
}

/** Returns the event with its URLs scrubbed of ids, or null to not send it at all. */
export function filterOutgoingEvent<T extends OutgoingEvent>(event: T | null): T | null {
  if (!event || !ALLOWED_EVENTS.has(event.event)) return null
  for (const bag of [event.properties, event.$set, event.$set_once]) {
    if (bag) sanitizeEventProperties(bag)
  }
  return event
}

/** Analytics runs only with an explicit yes; see Settings.analyticsConsentAt. */
export function analyticsAllowed(settings: { analyticsEnabled: boolean; analyticsConsentAt: number | null }): boolean {
  return settings.analyticsEnabled && settings.analyticsConsentAt !== null
}

function load(): Promise<void> {
  if (loading) return loading
  loading = import('posthog-js')
    .then(({ default: posthog }) => {
      // The answer may have changed to no while the library downloaded.
      if (!allowed) {
        loading = null
        return
      }
      posthog.init(apiKey!, {
        api_host: 'https://us.i.posthog.com',
        persistence: 'localStorage',
        // Only the events this app raises on purpose. Everything below switches off a
        // feature of the library that would otherwise send its own events, and
        // `before_send` is the backstop: anything not on the allowlist is dropped.
        before_send: filterOutgoingEvent,
        // No server-side feature switches. They are what turned dead-click capture on
        // for this project, and it sent the visible text of whatever was tapped.
        advanced_disable_flags: true,
        autocapture: false,
        capture_pageview: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_exceptions: false,
        capture_performance: false,
        rageclick: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_conversations: true,
        disable_web_experiments: true,
        // No anonymous person profiles, and no scripts fetched from PostHog's CDN.
        person_profiles: 'never',
        disable_external_dependency_loading: true,
      })
      posthog.opt_in_capturing()
      client = posthog
      for (const [event, properties] of pending) posthog.capture(event, properties)
      pending = []
    })
    .catch(() => {
      // Offline or blocked: analytics is optional, and the next launch tries again.
      loading = null
    })
  return loading
}

/**
 * Called once settings have loaded, and again whenever the answer changes.
 * PostHog is not downloaded or started, and nothing is written to the browser,
 * until the answer is yes. Taking it back stops capture and discards the identifier.
 */
export function syncAnalyticsConsent(isAllowed: boolean): void {
  allowed = isAllowed
  if (!apiKey) return
  if (isAllowed) {
    if (client) client.opt_in_capturing()
    else void load()
  } else {
    pending = []
    if (client) {
      client.opt_out_capturing()
      client.reset()
    }
  }
}

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  if (!apiKey || !allowed) return
  if (client) client.capture(event, properties)
  else if (pending.length < MAX_PENDING) pending.push([event, properties])
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
