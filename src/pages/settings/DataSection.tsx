import { useLiveQuery } from 'dexie-react-hooks'
import { countDoneWorkouts, countExercises, countRoutines } from '../../db/repo'
import type { DistanceUnit, WeightUnit } from '../../db/types'
import { ConfirmSheet, Sheet } from '../../components/Sheet'
import { formatRelative } from '../../lib/time'
import { describeCsvPreview, describeExerciseFixes, describeHistoryIssues, type DataTransfer } from './useDataTransfer'

/** The "Your data" card: counts, backup, import, cleanup and delete-all. */
export function DataSection({ data }: { data: DataTransfer }) {
  const {
    fileRef,
    backupStatus,
    restoreSnapshot,
    setConfirmUndo,
    setConfirmWipe,
    onFilePicked,
    scanHistory,
    scanExercises,
    exportBackup,
  } = data
  const workoutCount = useLiveQuery(() => countDoneWorkouts(), [], 0)
  const exerciseCount = useLiveQuery(() => countExercises(), [], 0)
  const routineCount = useLiveQuery(() => countRoutines(), [], 0)

  return (
    <>
      <div className="section-title">Your data</div>
      <div className="card">
        <div className="row" style={{ gap: 18, marginBottom: 12 }}>
          <div className="stack">
            <span className="stat-value mono">{workoutCount}</span>
            <span className="stat-label">Workouts</span>
          </div>
          <div className="stack">
            <span className="stat-value mono">{routineCount}</span>
            <span className="stat-label">Routines</span>
          </div>
          <div className="stack">
            <span className="stat-value mono">{exerciseCount}</span>
            <span className="stat-label">Exercises</span>
          </div>
        </div>
        <p className="faint" style={{ marginBottom: 12 }}>
          Your workouts, routines and exercises live on this device only. Export regularly because clearing your browser
          data or deleting the app will erase them.{' '}
          <strong>
            {backupStatus?.lastBackupAt
              ? `Last backup ${formatRelative(backupStatus.lastBackupAt)}.`
              : 'You have not made a backup yet.'}
          </strong>
        </p>
        <div className="list">
          <button className="btn btn-ghost btn-block" onClick={() => void exportBackup()}>
            Export backup (.json)
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => fileRef.current?.click()}>
            Import backup or CSV
          </button>
          {restoreSnapshot && (
            <button className="btn btn-ghost btn-block" onClick={() => setConfirmUndo(true)}>
              Undo last restore
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,text/csv,.csv"
            hidden
            onChange={(e) => void onFilePicked(e.target.files?.[0])}
          />
          <button className="btn btn-ghost btn-block" onClick={() => void scanHistory()}>
            Clean up history
          </button>
          <button className="btn btn-ghost btn-block" onClick={() => void scanExercises()}>
            Match imported exercises
          </button>
          <button className="btn btn-danger btn-block" onClick={() => setConfirmWipe(true)}>
            Delete all data
          </button>
        </div>
        <p className="faint" style={{ marginTop: 10 }}>
          Import accepts a Trana backup (.json, replaces everything), or a CSV export from Strong or Hevy (added
          alongside what's already here). Re-importing a CSV is safe because sessions you already have are skipped so a
          longer export only adds what's new. Clean up history finds duplicates and empty sets left behind by older
          imports; Match imported exercises folds differently-named imports into the built-in library.
        </p>
      </div>
    </>
  )
}

/**
 * The confirmation sheets for those actions. Rendered outside the page
 * container, like every sheet here, so they are not clipped by its animation.
 */
export function DataDialogs({ data }: { data: DataTransfer }) {
  const {
    restoreSnapshot,
    confirmWipe,
    setConfirmWipe,
    pendingImport,
    setPendingImport,
    confirmUndo,
    setConfirmUndo,
    pendingStrongText,
    setPendingStrongText,
    strongWeightUnit,
    setStrongWeightUnit,
    strongDistanceUnit,
    setStrongDistanceUnit,
    csvPreview,
    setCsvPreview,
    historyIssues,
    setHistoryIssues,
    exerciseFixes,
    setExerciseFixes,
    confirmStrongUnits,
    doImport,
    doUndoRestore,
    doCsvImport,
    doRepairHistory,
    doFixExercises,
    doWipe,
  } = data

  return (
    <>
      <ConfirmSheet
        open={pendingImport !== null}
        title="Replace everything?"
        message="Importing overwrites all workouts, routines and exercises on this device with the contents of the backup file."
        confirmLabel="Import"
        destructive
        onConfirm={() => void doImport()}
        onCancel={() => setPendingImport(null)}
      />

      <ConfirmSheet
        open={confirmUndo}
        title="Undo the last restore?"
        message={
          restoreSnapshot
            ? `This puts back the ${restoreSnapshot.workouts} workouts and ${restoreSnapshot.routines} routines that were on this device before the restore (${formatRelative(restoreSnapshot.createdAt)}), replacing what is here now. What is here now is kept, so you can undo again.`
            : undefined
        }
        confirmLabel="Undo restore"
        destructive
        onConfirm={() => void doUndoRestore()}
        onCancel={() => setConfirmUndo(false)}
      />

      <Sheet
        open={pendingStrongText !== null}
        title="What units was Strong using?"
        onClose={() => setPendingStrongText(null)}
        footer={
          <>
            <button className="btn btn-ghost grow" onClick={() => setPendingStrongText(null)}>
              Cancel
            </button>
            <button className="btn btn-primary grow" onClick={() => void confirmStrongUnits()}>
              Continue
            </button>
          </>
        }
      >
        <p className="muted" style={{ marginBottom: 12 }}>
          Strong's export doesn't record which units it used, so pick what your app was set to when you exported this
          file.
        </p>
        <div className="field">
          <span className="field-label">Weight</span>
          <div className="segmented">
            {(['kg', 'lb'] as WeightUnit[]).map((u) => (
              <button key={u} className={strongWeightUnit === u ? 'active' : ''} onClick={() => setStrongWeightUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <span className="field-label">Distance</span>
          <div className="segmented">
            {(['km', 'mi'] as DistanceUnit[]).map((u) => (
              <button
                key={u}
                className={strongDistanceUnit === u ? 'active' : ''}
                onClick={() => setStrongDistanceUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
      </Sheet>

      <ConfirmSheet
        open={csvPreview !== null}
        title="Add this history?"
        message={csvPreview ? describeCsvPreview(csvPreview) : undefined}
        confirmLabel="Import"
        onConfirm={() => void doCsvImport()}
        onCancel={() => setCsvPreview(null)}
      />

      <ConfirmSheet
        open={historyIssues !== null}
        title="Clean up history?"
        message={historyIssues ? describeHistoryIssues(historyIssues) : undefined}
        confirmLabel="Clean up"
        destructive
        onConfirm={() => void doRepairHistory()}
        onCancel={() => setHistoryIssues(null)}
      />

      <ConfirmSheet
        open={exerciseFixes !== null}
        title="Match imported exercises?"
        message={exerciseFixes ? describeExerciseFixes(exerciseFixes) : undefined}
        confirmLabel="Match"
        destructive
        onConfirm={() => void doFixExercises()}
        onCancel={() => setExerciseFixes(null)}
      />

      <ConfirmSheet
        open={confirmWipe}
        title="Delete all data?"
        message="Every workout, routine and custom exercise will be erased. Export a backup first if you might want any of it back."
        confirmLabel="Delete everything"
        destructive
        onConfirm={() => void doWipe()}
        onCancel={() => setConfirmWipe(false)}
      />
    </>
  )
}
