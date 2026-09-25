import { useEffect } from 'react'
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
import { HomePage } from './pages/Home'
import { ActiveWorkoutPage } from './pages/ActiveWorkout'
import { RoutineEditPage } from './pages/RoutineEdit'
import { HistoryPage } from './pages/History'
import { WorkoutDetailPage } from './pages/WorkoutDetail'
import { ExercisesPage } from './pages/Exercises'
import { ExerciseDetailPage } from './pages/ExerciseDetail'
import { SettingsPage } from './pages/Settings'
import { StatsPage } from './pages/Stats'
import { MeasurementsPage } from './pages/Measurements'
import { EditWorkoutPage } from './pages/EditWorkout'

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
            <Shell />
          </ActiveWorkoutProvider>
        </SetTimerProvider>
      </RestTimerProvider>
    </BrowserRouter>
  )
}
