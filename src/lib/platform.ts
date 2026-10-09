export type InstallPlatform = 'ios' | 'android' | 'desktop'

/**
 * Which kind of device this is, from the user agent. Kept apart from install.ts
 * because that module registers listeners and reads `window` as soon as it is
 * imported, which anything that only wants this answer should not have to do.
 */
export function detectInstallPlatform(): InstallPlatform {
  const ua = window.navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  // iPadOS 13+ identifies as a Mac; touch points are what give it away.
  if (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}
