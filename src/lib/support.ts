/**
 * The browsers Trana is built for: Safari and iOS 16.2+, Chrome and Edge 111+,
 * Firefox 113+. The line is drawn by CSS `color-mix()`, which the whole palette
 * is built on; everything else the app uses is older than that.
 *
 * Checked by feature, not by version number, so a browser that has the
 * capability passes whatever it calls itself.
 */

export interface SupportProbes {
  hasIndexedDb: boolean
  hasColorMix: boolean
  hasIntersectionObserver: boolean
}

export function readProbes(): SupportProbes {
  return {
    hasIndexedDb: typeof indexedDB !== 'undefined' && indexedDB !== null,
    hasColorMix:
      typeof CSS !== 'undefined' &&
      typeof CSS.supports === 'function' &&
      CSS.supports('color', 'color-mix(in srgb, red, blue)'),
    hasIntersectionObserver: typeof IntersectionObserver !== 'undefined',
  }
}

/** Plain-language reasons this browser cannot run the app, or none if it can. */
export function unsupportedReasons(probes: SupportProbes = readProbes()): string[] {
  const reasons: string[] = []
  if (!probes.hasIndexedDb) reasons.push('it cannot store data on this device (IndexedDB is unavailable)')
  if (!probes.hasColorMix) reasons.push('it is too old to draw the app’s colours')
  if (!probes.hasIntersectionObserver) reasons.push('it is too old to load long lists as you scroll')
  return reasons
}
