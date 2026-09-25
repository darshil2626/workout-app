import { useNavigate as useRouterNavigate, useLocation, type NavigateOptions, type To } from 'react-router-dom'

/** Screens that own the whole viewport and hide the tab bar. */
export const FULLSCREEN_ROUTES = ['/workout', '/routines']

/** Edit screens are modal too: leaving one mid-edit should be a deliberate act. */
export function isFullscreenRoute(pathname: string): boolean {
  return FULLSCREEN_ROUTES.some((p) => pathname.startsWith(p)) || pathname.endsWith('/edit')
}

function pathnameOf(to: To): string {
  return typeof to === 'string' ? to.split(/[?#]/)[0] : (to.pathname ?? '')
}

export interface AppNavigateOptions extends NavigateOptions {
  /**
   * Overrides the auto-classified direction. Needed for calls that are
   * logically backward but not distinguishable from the path alone — e.g.
   * `Header`'s explicit-path `back` prop (used where `navigate(-1)` isn't
   * reliable, such as a deep link with nothing usable in browser history):
   * the target is an ordinary path, so without this it would classify as
   * 'forward' and slide in from the wrong side.
   */
  direction?: 'forward' | 'back' | 'modal-in' | 'modal-out'
}

/**
 * Wraps React Router's `useNavigate` so every path-based navigation requests
 * a View Transition, and tags its direction on `<html>` first so CSS can
 * animate accordingly (see the `::view-transition-*` rules in index.css) —
 * inferred from where the navigation is headed relative to where it started,
 * unless a call site knows better (see `AppNavigateOptions.direction`).
 *
 * The numeric-delta overload (`navigate(-1)`, used by the header's Back
 * button in the common case) is passed straight through untouched. React
 * Router's delta overload takes no options parameter — it can't carry
 * `viewTransition` — so *that* back navigation stays an instant swap; only
 * path-based navigation animates. (Confirmed against the installed
 * react-router types, not assumed — the plan for this flagged it as
 * unverified going in.)
 */
export function useNavigate() {
  const navigate = useRouterNavigate()
  const location = useLocation()

  return (to: To | number, options?: AppNavigateOptions) => {
    if (typeof to === 'number') {
      navigate(to)
      return
    }

    const { direction: forcedDirection, ...routerOptions } = options ?? {}
    const fromFullscreen = isFullscreenRoute(location.pathname)
    const toFullscreen = isFullscreenRoute(pathnameOf(to))
    const direction =
      forcedDirection ??
      (toFullscreen && !fromFullscreen ? 'modal-in' : !toFullscreen && fromFullscreen ? 'modal-out' : 'forward')
    document.documentElement.dataset.navDirection = direction

    navigate(to, { ...routerOptions, viewTransition: true })
  }
}
