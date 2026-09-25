import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ActiveWorkoutProvider } from './state/ActiveWorkoutContext'
import { RestTimerProvider } from './state/RestTimerContext'
import { SetTimerProvider } from './state/SetTimerContext'
import { useSettings } from './lib/useSettings'
import { applyTheme, resolveTheme } from './lib/theme'
import { isFullscreenRoute } from './lib/navigate'
import { detectPlatform, isStandalonePwa, syncAnalyticsConsent, track, trackPageview } from './lib/analytics'
import { BottomNav } from './components/BottomNav'
import { RestTimerBar } from './components/RestTimerBar'
import { ActiveWorkoutBanner } from './components/ActiveWorkoutBanner'
import { UpdatePrompt } from './components/UpdatePrompt'
import { ErrorBoundary } from './components/ErrorBoundary'

// Route-level code splitting: each page becomes its own chunk, fetched on
// first visit rather than bundled into the initial payload. The Suspense
// fallback below covers the gap between navigating and the chunk arriving.
const HomePage = lazy(() => import('./pages/Home').then((m) => ({ default: m.HomePage })))
const ActiveWorkoutPage = lazy(() => import('./pages/ActiveWorkout').then((m) => ({ default: m.ActiveWorkoutPage })))
const RoutineEditPage = lazy(() => import('./pages/RoutineEdit').then((m) => ({ default: m.RoutineEditPage })))
const HistoryPage = lazy(() => import('./pages/History').then((m) => ({ default: m.HistoryPage })))
const WorkoutDetailPage = lazy(() => import('./pages/WorkoutDetail').then((m) => ({ default: m.WorkoutDetailPage })))
const ExercisesPage = lazy(() => import('./pages/Exercises').then((m) => ({ default: m.ExercisesPage })))
const ExerciseDetailPage = lazy(() =>
  import('./pages/ExerciseDetail').then((m) => ({ default: m.ExerciseDetailPage })),
)
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })))
const StatsPage = lazy(() => import('./pages/Stats').then((m) => ({ default: m.StatsPage })))
const MeasurementsPage = lazy(() => import('./pages/Measurements').then((m) => ({ default: m.MeasurementsPage })))
const EditWorkoutPage = lazy(() => import('./pages/EditWorkout').then((m) => ({ default: m.EditWorkoutPage })))

function Shell() {
  const location = useLocation()
  const { theme, analyticsEnabled } = useSettings()
  const fullscreen = isFullscreenRoute(location.pathname)

  // A route change is a new screen, not a continuation of the last one's
  // scroll position — without this, opening e.g. an exercise from partway
  // down a scrolled list renders that detail page already scrolled down.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  // Must run before the pageview/app_opened effects below so PostHog is
  // initialized (or opted out) before anything tries to capture.
  useEffect(() => {
    syncAnalyticsConsent(analyticsEnabled)
  }, [analyticsEnabled])

  useEffect(() => {
    const firstOpen = window.localStorage.getItem('ironlog_opened') === null
    window.localStorage.setItem('ironlog_opened', '1')
    track('app_opened', { is_pwa: isStandalonePwa(), platform: detectPlatform(), first_open: firstOpen })
  }, [])

  useEffect(() => {
    trackPageview(location.pathname)
  }, [location.pathname])

  // Chrome/Android only — iOS Safari has no programmatic hook for "Add to
  // Home Screen", so there the install funnel is only ever visible as a
  // later app_opened with is_pwa: true. Left un-prevented so the browser's
  // own install UI still shows; this only observes it.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      track('pwa_install_prompt_shown')
      const choiceEvent = e as Event & { userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
      void choiceEvent.userChoice.then(({ outcome }) => {
        track(outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed')
      })
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  // Re-applies whenever the setting changes (main.tsx only covers the first
  // paint), and stays live for 'system' — flipping the OS theme updates the
  // app immediately rather than waiting for a reload.
  useEffect(() => {
    applyTheme(resolveTheme(theme))
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme(resolveTheme('system'))
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [theme])

  return (
    <div className={`app${fullscreen ? ' fullscreen' : ''}`}>
      {/* The extra bottom padding keeps the last row clear of the rest timer. */}
      <main className="app-main" style={fullscreen ? { paddingBottom: 96 } : undefined}>
        <Suspense fallback={<div className="spinner" />}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/workout" element={<ActiveWorkoutPage />} />
            <Route path="/routines/:id" element={<RoutineEditPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:id" element={<WorkoutDetailPage />} />
            <Route path="/history/:id/edit" element={<EditWorkoutPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/measurements" element={<MeasurementsPage />} />
            <Route path="/exercises" element={<ExercisesPage />} />
            <Route path="/exercises/:id" element={<ExerciseDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      {!fullscreen && <ActiveWorkoutBanner />}
      <RestTimerBar />
      {!fullscreen && <BottomNav />}
      <UpdatePrompt />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <RestTimerProvider>
        <SetTimerProvider>
          <ActiveWorkoutProvider>
            {/* Inside the timer/workout providers so a render error caught here
                doesn't unmount that state — Dexie is still the source of truth,
                but there's no reason to throw away in-memory state we don't
                have to. */}
            <ErrorBoundary>
              <Shell />
            </ErrorBoundary>
          </ActiveWorkoutProvider>
        </SetTimerProvider>
      </RestTimerProvider>
    </BrowserRouter>
  )
}
