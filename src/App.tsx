import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ActiveWorkoutProvider } from './state/ActiveWorkoutContext'
import { RestTimerProvider } from './state/RestTimerContext'
import { BottomNav } from './components/BottomNav'
import { RestTimerBar } from './components/RestTimerBar'
import { ActiveWorkoutBanner } from './components/ActiveWorkoutBanner'
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

/** Screens that own the whole viewport and hide the tab bar. */
const FULLSCREEN = ['/workout', '/routines']

function Shell() {
  const location = useLocation()
  // Edit screens are modal too: leaving one mid-edit should be a deliberate act.
  const fullscreen =
    FULLSCREEN.some((p) => location.pathname.startsWith(p)) || location.pathname.endsWith('/edit')

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
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <RestTimerProvider>
        <ActiveWorkoutProvider>
          <Shell />
        </ActiveWorkoutProvider>
      </RestTimerProvider>
    </BrowserRouter>
  )
}
