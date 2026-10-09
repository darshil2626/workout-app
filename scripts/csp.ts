import { createHash } from 'node:crypto'

/**
 * The Content-Security-Policy for production builds.
 *
 * GitHub Pages cannot send response headers, so the policy is a <meta> tag. That
 * rules out `frame-ancestors` and reporting, but still stops the main thing a CSP
 * is for here: injected script running, or data being sent to a host the app does
 * not use.
 *
 * - script-src is 'self' plus the exact hash of each inline script in index.html.
 *   The hashes are computed from the built page, so editing the splash script
 *   cannot leave the policy stale, and no 'unsafe-inline' is needed for scripts.
 * - style-src keeps 'unsafe-inline': the splash has a <style> block and inline
 *   style attributes, and style injection is a far smaller risk than script.
 * - connect-src allows only this origin and the analytics hosts.
 * - Dev builds get no policy, because the dev server injects inline scripts.
 */

/** Events go to the first; PostHog can lazy-load helper scripts from the second. */
const ANALYTICS_API = 'https://us.i.posthog.com'
const ANALYTICS_ASSETS = 'https://us-assets.i.posthog.com'

/** SHA-256 CSP source for each inline <script> (those without a src). */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = []
  // The end tag may carry whitespace or attributes (`</script >`); HTML parsers accept them.
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(html)) !== null) {
    if (/\bsrc\s*=/.test(match[1])) continue
    hashes.push(`'sha256-${createHash('sha256').update(match[2], 'utf8').digest('base64')}'`)
  }
  return hashes
}

export function contentSecurityPolicy(html: string): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...inlineScriptHashes(html), ANALYTICS_ASSETS],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ANALYTICS_API, ANALYTICS_ASSETS],
    'manifest-src': ["'self'"],
    'worker-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}

/** Inserts the policy as the first thing in <head>, so it governs everything after it. */
export function withCsp(html: string): string {
  const policy = contentSecurityPolicy(html)
  const tag = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`
  return html.replace(/<head([^>]*)>/i, `<head$1>\n    ${tag}`)
}
