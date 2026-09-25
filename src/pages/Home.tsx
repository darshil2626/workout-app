import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '../lib/navigate'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, newId } from '../db/db'
import type { Routine } from '../db/types'
import { useActiveWorkout } from '../state/ActiveWorkoutContext'
import { Header } from '../components/Header'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { Toast } from '../components/Toast'
import { IconList, IconPlay, IconPlus, IconSettings, IconTrash } from '../components/Icons'
import { useFormatters } from '../lib/useSettings'
import { computeStreaks, overallTotals, volumeByDay } from '../lib/stats'
import {
  habitWindow,
  homeStatus,
  muscleRecovery,
  nextMilestone,
  strengthTrend,
  suggestNextRoutine,
  weekProgress,
  type StrengthLift,
} from '../lib/home'
import { ConsistencyCalendar } from '../components/home/ConsistencyCalendar'
import { FirstRun } from '../components/home/FirstRun'
import { GoalRing } from '../components/home/GoalRing'
import { PrimaryAction } from '../components/home/PrimaryAction'
import { RecentWins, collectWins, type Win } from '../components/home/RecentWins'
import { RecoveryCard } from '../components/home/RecoveryCard'
import { RoutinesSection } from '../components/home/RoutinesSection'
import { StrengthTrend } from '../components/home/StrengthTrend'
import { Skeleton } from '../components/Skeleton'

/**
 * How many finished sessions are scanned for personal records.
 *
 * `prsForWorkout` reloads every workout containing each exercise, so the cost
 * grows with both the session's exercise count and the whole training history.
 * Three is enough to fill a four-item list on the home screen and is the most
 * that can be afforded on a screen the user opens constantly.
 */
const PR_SESSIONS = 3
const MAX_WINS = 4

/** Fewer than two muscles is not a balance picture, just a single stray bar. */
const MIN_RECOVERY_ROWS = 2

/**
 * Width of the home screen's consistency calendar, in days. Shorter than
 * Stats' 17-week activity heatmap on purpose: this is a glance-and-go widget,
 * not the place to review months of history — that's what the Stats page is
 * for. Ten weeks is enough to see the current run and a couple of rest days
 * around it without needing to scroll.
 */
const HOME_CALENDAR_DAYS = 70

/**
 * Shaped like the dashboard that's about to assemble itself: a primary
 * action button, a goal ring, and a couple of routine rows. This screen is
 * the app's default landing route and gates on four Dexie queries before its
 * first paint, so on a cold start it's one of the two or three places in the
 * app where a wait is long enough for a skeleton to earn its keep over a
 * generic spinner.
 */
function HomeSkeleton() {
  return (
    <>
      <Skeleton height={52} radius={14} style={{ marginBottom: 16 }} />
      <Skeleton height={96} radius={16} style={{ marginBottom: 16 }} />
      <Skeleton height={64} radius={14} style={{ marginBottom: 12 }} />
      <Skeleton height={64} radius={14} />
    </>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const fmt = useFormatters()
  const { workout, startEmpty, startFromRoutine } = useActiveWorkout()

  // Deliberately undefaulted: `undefined` means Dexie has not answered yet,
  // which is not the same as an empty table. Defaulting to [] would flash the
  // brand-new-user screen at a six-month user on every cold start, and — the
  // bug behind CurrentProblems item 11 — would hand PR detection an empty
  // exercise library, in which every exercise is unknown and no record exists.
  const routines = useLiveQuery(() => db.routines.toArray(), [])
  const folders = useLiveQuery(() => db.folders.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const sessions = useLiveQuery(() => db.workouts.where('status').equals('done').toArray(), [])

  const loaded =
    routines !== undefined &&
    folders !== undefined &&
    exercises !== undefined &&
    sessions !== undefined

  const [menuRoutine, setMenuRoutine] = useState<Routine | null>(null)
  const [deleting, setDeleting] = useState<Routine | null>(null)
  // Holds what a swipe just removed so an Undo tap can put it back.
  const [undoRoutine, setUndoRoutine] = useState<Routine | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [startBlocked, setStartBlocked] = useState<null | { routine?: Routine }>(null)
  const routinesRef = useRef<HTMLDivElement>(null)

  const routineList = useMemo(() => routines ?? [], [routines])
  const folderList = useMemo(() => folders ?? [], [folders])
  const exerciseList = useMemo(() => exercises ?? [], [exercises])
  const workoutList = useMemo(() => sessions ?? [], [sessions])
  const exerciseById = useMemo(
    () => new Map(exerciseList.map((e) => [e.id, e])),
    [exerciseList],
  )

  const { firstDayOfWeek, weeklyGoalWorkouts, countWarmupSets, bodyweightKg } = fmt.settings

  const goal = useMemo(
    () => weekProgress(workoutList, firstDayOfWeek, weeklyGoalWorkouts),
    [workoutList, firstDayOfWeek, weeklyGoalWorkouts],
  )
  const streaks = useMemo(
    () => computeStreaks(workoutList, firstDayOfWeek),
    [workoutList, firstDayOfWeek],
  )
  const calendarDays = useMemo(
    () => volumeByDay(workoutList, HOME_CALENDAR_DAYS),
    [workoutList],
  )
  const recovery = useMemo(
    () => muscleRecovery(workoutList, exerciseById, countWarmupSets),
    [workoutList, exerciseById, countWarmupSets],
  )
  const totals = useMemo(() => overallTotals(workoutList), [workoutList])
  const milestone = useMemo(() => nextMilestone(totals), [totals])
  const habit = useMemo(() => habitWindow(workoutList), [workoutList])
  const suggestion = useMemo(() => suggestNextRoutine(routineList), [routineList])
  const hasHistory = workoutList.length > 0
  // Not memoised, deliberately: it is a date lookup and four comparisons, and
  // recomputing it every render is what keeps the weekday correct on a PWA
  // that has been sitting on the home screen since yesterday.
  const status = homeStatus(goal, recovery, hasHistory, workout !== null)

  const recent = useMemo(
    () =>
      [...workoutList]
        .sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt))
        .slice(0, PR_SESSIONS),
    [workoutList],
  )

  /**
   * Identity of the sessions being scanned, by content rather than by array
   * reference. Editing a past session changes its totals and should re-badge
   * it; a live query re-running and handing back an equal array should not.
   * The active session is never in here — it isn't `done` — so its autosave,
   * which writes every few hundred milliseconds, cannot start a rescan.
   */
  const recentKey = recent
    .map((w) => `${w.id}:${w.totalSets}:${Math.round(w.totalVolumeKg)}`)
    .join('|')

  // `null` until the scan finishes. Rendering [] in the meantime would title
  // the block "Next milestone", then swap it for "Recent wins" a moment later.
  const [wins, setWins] = useState<Win[] | null>(null)

  useEffect(() => {
    // Never against a half-loaded library: an exercise missing from the map is
    // skipped outright, so a partial map reads as "no records ever set".
    if (!loaded || recent.length === 0) {
      setWins([])
      return
    }
    let cancelled = false
    void (async () => {
      const found = await collectWins(recent, exerciseById, bodyweightKg, countWarmupSets, MAX_WINS)
      if (!cancelled) setWins(found)
    })()
    return () => {
      cancelled = true
    }
    // `recent` is covered by `recentKey`; depending on the array itself would
    // rescan on every re-run of the live query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, recentKey, exerciseById, bodyweightKg, countWarmupSets])

  /**
   * The same trick as `recentKey`, for the whole history rather than three
   * sessions: the totals only move when a session is finished, edited or
   * deleted, which are exactly the moments the trend changes. Depending on
   * `workoutList` itself would restart a scan of history every time any live
   * query re-ran, and the running session's autosave fires one every few
   * hundred milliseconds.
   */
  const trendKey = `${totals.workouts}:${totals.sets}:${totals.reps}:${Math.round(totals.volumeKg)}`

  // `null` until the scan finishes, so the block stays absent rather than
  // rendering an empty card and then filling it.
  const [lifts, setLifts] = useState<StrengthLift[] | null>(null)

  useEffect(() => {
    // Same guard as the wins scan: an exercise missing from a half-loaded
    // library is skipped, so computing against one would silently find nothing.
    if (!loaded || workoutList.length === 0) {
      setLifts([])
      return
    }
    let cancelled = false
    void (async () => {
      const found = await strengthTrend(workoutList, exerciseById, bodyweightKg, countWarmupSets)
      if (!cancelled) setLifts(found)
    })()
    return () => {
      cancelled = true
    }
    // `workoutList` is covered by `trendKey`, above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, trendKey, exerciseById, bodyweightKg, countWarmupSets])

  /**
   * Only one session can be active. Starting another would silently orphan the
   * first, so the user is asked to deal with it explicitly.
   */
  async function start(routine?: Routine) {
    if (workout) {
      setStartBlocked({ routine })
      return
    }
    if (routine) await startFromRoutine(routine)
    else await startEmpty()
    navigate('/workout')
  }

  async function createFolder() {
    const name = folderName.trim()
    if (name === '') return
    await db.folders.add({
      id: newId(),
      name,
      order: folderList.length,
      createdAt: Date.now(),
    })
    setFolderName('')
    setNewFolder(false)
  }

  async function removeRoutine(routine: Routine) {
    await db.routines.delete(routine.id)
  }

  async function deleteRoutine(routine: Routine) {
    await removeRoutine(routine)
    setDeleting(null)
  }

  function swipeDeleteRoutine(routine: Routine) {
    void removeRoutine(routine)
    setUndoRoutine(routine)
  }

  async function undoDeleteRoutine() {
    if (!undoRoutine) return
    await db.routines.put(undoRoutine)
    setUndoRoutine(null)
  }

  function scrollToRoutines() {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    routinesRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  const firstRun = loaded && !hasHistory && routineList.length === 0 && folderList.length === 0 && !workout

  // Each block earns its place or is absent. A goal of zero has no arc to draw,
  // a handful of sessions is not yet a strength trend, and one lonely muscle
  // row is noise rather than a balance picture.
  const showGoal = hasHistory && goal.goal > 0
  // Independent of the weekly-goal card: a streak means something even for
  // someone who hasn't set a target, and the old text version showed the
  // streak inside `GoalRing` only, which hid it entirely with no goal set.
  const showConsistency = hasHistory
  // `strengthTrend` already refuses anything it cannot say something about —
  // too few sessions, or no exercise whose load is measurable — so an empty
  // result is the signal to stay away rather than draw a flat card.
  const showTrend = lifts !== null && lifts.length > 0
  const showRecovery = recovery.length >= MIN_RECOVERY_ROWS
  const showWins = wins !== null && (wins.length > 0 || (hasHistory && milestone !== null))

  return (
    <>
      <Header
        title={
          <span className="home-status">
            {status.day}
            {status.fact && <span className="home-status-fact"> · {status.fact}</span>}
          </span>
        }
        left={
          <button
            className="icon-btn"
            aria-label="Exercise library"
            onClick={() => navigate('/exercises')}
          >
            {/* A magnifier promised search; this button opens the library. The
                Exercises page keeps its own search field, and IconSearch with
                it. */}
            <IconList />
          </button>
        }
        right={
          <button className="icon-btn" aria-label="Settings" onClick={() => navigate('/settings')}>
            <IconSettings />
          </button>
        }
      />

      <div className="page">
        {!loaded ? (
          <HomeSkeleton />
        ) : firstRun ? (
          <FirstRun
            onStartEmpty={() => void start()}
            onNewRoutine={() => navigate('/routines/new')}
          />
        ) : (
          <>
            <PrimaryAction
              activeWorkout={workout}
              suggestion={suggestion}
              routineCount={routineList.length}
              habit={habit}
              onResume={() => navigate('/workout')}
              onStartSuggested={() => suggestion && void start(suggestion)}
              onStartEmpty={() => void start()}
              onChoose={scrollToRoutines}
            />

            {showGoal && <GoalRing progress={goal} streaks={streaks} />}
            {showConsistency && (
              <ConsistencyCalendar
                days={calendarDays}
                streaks={streaks}
                firstDayOfWeek={firstDayOfWeek}
                fmt={fmt}
              />
            )}
            {showTrend && <StrengthTrend lifts={lifts ?? []} fmt={fmt} />}
            {showRecovery && <RecoveryCard items={recovery} />}
            {showWins && <RecentWins wins={wins ?? []} milestone={milestone} fmt={fmt} />}

            <div ref={routinesRef} className="home-routines-anchor">
              <RoutinesSection
                routines={routineList}
                folders={folderList}
                exerciseById={exerciseById}
                onStart={(r) => void start(r)}
                onMenu={setMenuRoutine}
                onSwipeDelete={swipeDeleteRoutine}
                onNewRoutine={() => navigate('/routines/new')}
                onNewFolder={() => setNewFolder(true)}
              />
            </div>
          </>
        )}
      </div>

      <Sheet
        open={menuRoutine !== null}
        title={menuRoutine?.name}
        onClose={() => setMenuRoutine(null)}
      >
        <button
          className="sheet-list-item"
          onClick={() => {
            const r = menuRoutine
            setMenuRoutine(null)
            if (r) void start(r)
          }}
        >
          <IconPlay />
          <span className="grow">Start routine</span>
        </button>
        <button
          className="sheet-list-item"
          onClick={() => {
            const r = menuRoutine
            setMenuRoutine(null)
            if (r) navigate(`/routines/${r.id}`)
          }}
        >
          <IconPlus />
          <span className="grow">Edit routine</span>
        </button>
        <button
          className="sheet-list-item danger"
          onClick={() => {
            setDeleting(menuRoutine)
            setMenuRoutine(null)
          }}
        >
          <IconTrash />
          <span className="grow">Delete routine</span>
        </button>
      </Sheet>

      <Sheet
        open={newFolder}
        title="New folder"
        onClose={() => setNewFolder(false)}
        footer={
          <>
            <button className="btn btn-ghost grow" onClick={() => setNewFolder(false)}>
              Cancel
            </button>
            <button className="btn btn-primary grow" onClick={() => void createFolder()}>
              Create
            </button>
          </>
        }
      >
        <div className="field">
          <label className="field-label" htmlFor="folder-name">
            Folder name
          </label>
          <input
            id="folder-name"
            className="input"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder="e.g. Push Pull Legs"
          />
        </div>
      </Sheet>

      <ConfirmSheet
        open={deleting !== null}
        title={`Delete “${deleting?.name}”?`}
        message="Past workouts started from this routine are kept."
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleting && void deleteRoutine(deleting)}
        onCancel={() => setDeleting(null)}
      />

      <ConfirmSheet
        open={startBlocked !== null}
        title="A workout is already running"
        message={`Finish or discard “${workout?.name}” before starting another.`}
        confirmLabel="Go to workout"
        onConfirm={() => {
          setStartBlocked(null)
          navigate('/workout')
        }}
        onCancel={() => setStartBlocked(null)}
      />

      <Toast
        message={undoRoutine ? `Deleted "${undoRoutine.name}"` : null}
        actionLabel="Undo"
        onAction={() => void undoDeleteRoutine()}
        onDismiss={() => setUndoRoutine(null)}
      />
    </>
  )
}
