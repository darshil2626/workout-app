import type { Theme } from '../db/types'

export type ResolvedTheme = 'light' | 'dark'

/**
 * Must track `--bg` in src/styles for each theme — same convention already
 * used for the PWA manifest's `theme_color` in vite.config.ts, which can't be
 * changed at runtime and so stays on the dark value. This one backs the live
 * `<meta name="theme-color">` tag instead, which can.
 */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#0f0d0b',
  light: '#f2ece2',
}

/** The launch splash's field, from index.html. The status bar matches it while it is up. */
const SPLASH_COLOR = '#b5400e'

let current: ResolvedTheme = 'dark'

/** 'system' resolves through the OS; an explicit choice just passes through. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

/** Applies a resolved theme to the document and keeps the status-bar color in sync. */
export function applyTheme(resolved: ResolvedTheme): void {
  current = resolved
  document.documentElement.dataset.theme = resolved
  syncThemeColor()
}

/**
 * Sets the status-bar color: the splash's while it is covering the screen,
 * the theme's otherwise. Called by `applyTheme` and again when the splash
 * starts to fade, so the theme change that happened underneath it lands then.
 */
export function syncThemeColor(): void {
  const splash = document.getElementById('splash')
  const held = splash !== null && !splash.classList.contains('leaving')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', held ? SPLASH_COLOR : THEME_COLOR[current])
}
