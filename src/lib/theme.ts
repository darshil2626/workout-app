import type { Theme } from '../db/types'

export type ResolvedTheme = 'light' | 'dark'

/**
 * Must track `--bg` in index.css for each theme — same convention already
 * used for the PWA manifest's `theme_color`/`background_color` in
 * vite.config.ts, which can't be changed at runtime and so stays on the dark
 * value. This one backs the live `<meta name="theme-color">` tag instead,
 * which can.
 */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#0f0d0b',
  light: '#f2ece2',
}

/** 'system' resolves through the OS; an explicit choice just passes through. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

/** Applies a resolved theme to the document and keeps the status-bar color in sync. */
export function applyTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolved])
}
