import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { initDb } from '../../db/db'
import { listExercises } from '../../db/repo'
import type { DistanceUnit, Exercise, WeightUnit, Workout } from '../../db/types'
import { useSettings } from '../../lib/useSettings'
import {
  getRestoreSnapshot,
  parseBackup,
  restoreBackup,
  undoRestore,
  wipeAllData,
  type ImportSummary,
} from '../../lib/backup'
import { getBackupStatus } from '../../lib/backupReminder'
import { detectFormat } from '../../lib/importers/detect'
import { parseStrongCsv, sniffStrongDisclosedUnits } from '../../lib/importers/strong'
import { parseHevyCsv } from '../../lib/importers/hevy'
import { applyCsvImport } from '../../lib/importers/apply'
import {
  hasHistoryIssues,
  partitionImport,
  repairHistory,
  scanHistoryIssues,
  type HistoryIssues,
} from '../../lib/dedupe'
import { applyExerciseFixes, hasActiveWorkout, scanExerciseFixes, type ExerciseFix } from '../../lib/exerciseRepair'
import type { ParsedImport } from '../../lib/importers/shared'
import { track } from '../../lib/analytics'
import { downloadBackup } from '../../lib/backup'
import { useRestTimer } from '../../state/RestTimerContext'

/** What a CSV import would actually do, worked out before the user commits to it. */
export interface CsvPreview {
  parsed: ParsedImport
  /** Workouts not already on this device — the ones that get added. */
  fresh: Workout[]
  /** Exercises only the fresh workouts introduce. */
  newExercises: number
  /** Workouts skipped because that exact session is already stored. */
  skipped: number
  sameTimeDifferent: number
}

export function describeCsvPreview(preview: CsvPreview): string {
  const { parsed, fresh } = preview
  const sourceLabel = parsed.source === 'strong' ? 'Strong' : 'Hevy'
  const dates = fresh.map((w) => w.startedAt)
  const earliest = new Date(Math.min(...dates)).toLocaleDateString()
  const latest = new Date(Math.max(...dates)).toLocaleDateString()
  const range = earliest === latest ? earliest : `${earliest} – ${latest}`
  const exerciseText = preview.newExercises > 0 ? `, creating ${preview.newExercises} new exercise(s)` : ''
  const skipText =
    preview.skipped > 0
      ? ` ${preview.skipped} workout(s) in this file are already in your history and will be skipped.`
      : ''
  const sameTimeText =
    preview.sameTimeDifferent > 0
      ? ` ${preview.sameTimeDifferent} start at the same time as a session you already have but log different sets so those are added as new.`
      : ''
  const warnText =
    parsed.warnings.length > 0 ? ` ${parsed.warnings.length} row(s) couldn't be read and were skipped.` : ''
  return `Adds ${fresh.length} workout(s) from ${sourceLabel} (${range})${exerciseText}. This does not remove anything already on this device.${skipText}${sameTimeText}${warnText}`
}

export function describeHistoryIssues(issues: HistoryIssues): string {
  const parts: string[] = []
  if (issues.duplicates > 0) {
    parts.push(`${issues.duplicates} workout(s) are exact copies of another session so one copy of each is kept.`)
  }
  if (issues.placeholderSets > 0) {
    parts.push(
      `${issues.placeholderSets} workout(s) hold sets that record nothing (an import kept rows for sets you never performed) so those sets go and the totals are recalculated.`,
    )
  }
  if (issues.emptyWorkouts > 0) {
    parts.push(`${issues.emptyWorkouts} workout(s) record nothing at all and are deleted.`)
  }
  return `${parts.join(' ')} Export a backup first if you want a safety net.`
}

export function describeExerciseFixes(fixes: ExerciseFix[]): string {
  const merges = fixes.filter((f) => f.into !== null)
  const moved = merges.reduce((n, f) => n + f.workouts, 0)
  const reclassified = fixes.length - merges.length
  const parts: string[] = []
  if (merges.length > 0) {
    parts.push(
      `${merges.length} exercise(s) are the same movement as a built-in one and will be merged into it, moving ${moved} workout(s).`,
    )
  }
  if (reclassified > 0) {
    parts.push(`${reclassified} exercise(s) will be moved out of 'Other' into the right muscle group.`)
  }
  return `${parts.join(' ')} Export a backup first if you want a safety net.`
}

function describeRepair(issues: HistoryIssues): string {
  const parts: string[] = []
  if (issues.duplicates > 0) parts.push(`removed ${issues.duplicates} duplicate workout(s)`)
  if (issues.placeholderSets > 0) {
    parts.push(`cleaned empty sets out of ${issues.placeholderSets} workout(s)`)
  }
  if (issues.emptyWorkouts > 0) parts.push(`deleted ${issues.emptyWorkouts} empty workout(s)`)
  return parts.length > 0 ? `History cleaned: ${parts.join(', ')}.` : 'Nothing needed cleaning.'
}

/** Where the data actions report back to: the banners at the top of Settings. */
export interface DataReporter {
  setMessage: (message: string | null) => void
  setError: (error: string | null) => void
}

/**
 * Everything behind the "Your data" card: exporting, importing (backup or
 * Strong/Hevy CSV), undoing a restore, cleaning up history and wiping. It owns
 * the state of each confirmation, and reports outcomes through `report`.
 */
export function useDataTransfer({ setMessage, setError }: DataReporter) {
  const settings = useSettings()
  const restTimer = useRestTimer()
  const fileRef = useRef<HTMLInputElement>(null)

  const [confirmWipe, setConfirmWipe] = useState(false)
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [confirmUndo, setConfirmUndo] = useState(false)
  // What the last restore replaced, while it can still be put back.
  const restoreSnapshot = useLiveQuery(() => getRestoreSnapshot(), [], null)
  const backupStatus = useLiveQuery(() => getBackupStatus(), [])
  const [pendingStrongText, setPendingStrongText] = useState<string | null>(null)
  const [strongWeightUnit, setStrongWeightUnit] = useState<WeightUnit>('kg')
  const [strongDistanceUnit, setStrongDistanceUnit] = useState<DistanceUnit>('km')
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null)
  const [historyIssues, setHistoryIssues] = useState<HistoryIssues | null>(null)
  const [exerciseFixes, setExerciseFixes] = useState<ExerciseFix[] | null>(null)

  async function exportBackup() {
    setError(null)
    try {
      const outcome = await downloadBackup()
      if (outcome === 'cancelled') return
      track('backup_exported')
      setMessage(
        outcome === 'shared'
          ? 'Backup ready. Choose Save to Files (or send it to yourself) so it is kept somewhere other than this phone.'
          : 'Backup saved to your downloads.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make a backup.')
    }
  }

  async function onFilePicked(file: File | undefined) {
    if (!file) return
    setError(null)
    setMessage(null)
    let text: string
    try {
      text = await file.text()
    } catch {
      setError('Could not read that file.')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (fileRef.current) fileRef.current.value = ''

    const format = detectFormat(text)
    if (format === 'backup') {
      // Validate before asking. Importing replaces everything on the device, so
      // being prompted to confirm that for a file that is then rejected is a
      // scare with nothing behind it.
      try {
        parseBackup(text)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That backup could not be read.')
        return
      }
      setPendingImport(text)
    } else if (format === 'strong') {
      const disclosed = sniffStrongDisclosedUnits(text)
      if (disclosed.weight && disclosed.distance) {
        // The file's own header says what unit Weight/Distance are in — no need to ask.
        await previewCsv((existing) =>
          parseStrongCsv(text, { weightUnit: 'kg', distanceUnit: 'km' }, existing, settings.bodyweightKg),
        )
      } else {
        setStrongWeightUnit(settings.weightUnit)
        setStrongDistanceUnit(settings.distanceUnit)
        setPendingStrongText(text)
      }
    } else if (format === 'hevy') {
      await previewCsv((existing) => parseHevyCsv(text, existing, settings.bodyweightKg))
    } else {
      setError('Unrecognized file. Expected a Trana backup (.json), or a CSV export from Strong or Hevy.')
    }
  }

  async function previewCsv(build: (existing: Exercise[]) => ParsedImport) {
    try {
      const existing = await listExercises()
      const parsed = build(existing)
      if (parsed.workouts.length === 0) {
        setError('No workouts were found in that file.')
        return
      }
      const { fresh, duplicates, sameTimeDifferent } = await partitionImport(parsed.workouts)
      if (fresh.length === 0) {
        setMessage('Every workout in that file is already in your history. Nothing to add.')
        return
      }
      const usedIds = new Set(fresh.flatMap((w) => w.exerciseIds))
      setCsvPreview({
        parsed,
        fresh,
        newExercises: parsed.newExercises.filter((e) => usedIds.has(e.id)).length,
        skipped: duplicates.length,
        sameTimeDifferent,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    }
  }

  async function confirmStrongUnits() {
    const text = pendingStrongText
    setPendingStrongText(null)
    if (!text) return
    await previewCsv((existing) =>
      parseStrongCsv(
        text,
        { weightUnit: strongWeightUnit, distanceUnit: strongDistanceUnit },
        existing,
        settings.bodyweightKg,
      ),
    )
  }

  async function doImport() {
    if (!pendingImport) return
    try {
      const summary: ImportSummary = await restoreBackup(pendingImport)
      setMessage(
        `Restored ${summary.workouts} workouts, ${summary.routines} routines, ${summary.exercises} exercises and ${summary.measurements} measurements. What was here before is kept, so Undo last restore can bring it back.`,
      )
      setError(null)
      track('backup_imported')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setPendingImport(null)
    }
  }

  async function doUndoRestore() {
    setConfirmUndo(false)
    try {
      const summary = await undoRestore()
      setMessage(`Put back ${summary.workouts} workouts and ${summary.routines} routines from before the last restore.`)
      setError(null)
      track('backup_restore_undone')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not undo the restore.')
    }
  }

  async function doCsvImport() {
    if (!csvPreview) return
    const { parsed } = csvPreview
    const sourceLabel = parsed.source === 'strong' ? 'Strong' : 'Hevy'
    try {
      const summary = await applyCsvImport(parsed)
      const skipText = summary.skipped > 0 ? ` ${summary.skipped} were already in your history and were skipped.` : ''
      const warnText = parsed.warnings.length > 0 ? ` ${parsed.warnings.length} row(s) were skipped.` : ''
      setMessage(
        `Added ${summary.workouts} workouts and ${summary.exercises} new exercises from ${sourceLabel}.${skipText}${warnText}`,
      )
      setError(null)
      track('csv_import_used', { source: parsed.source })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setCsvPreview(null)
    }
  }

  async function scanHistory() {
    setError(null)
    setMessage(null)
    try {
      const issues = await scanHistoryIssues()
      if (hasHistoryIssues(issues)) setHistoryIssues(issues)
      else setMessage('Your history is already clean with no duplicates and no empty sets.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not scan your history.')
    }
  }

  async function doRepairHistory() {
    setHistoryIssues(null)
    try {
      setMessage(describeRepair(await repairHistory()))
      setError(null)
      track('history_cleanup_run')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clean up your history.')
    }
  }

  async function scanExercises() {
    setError(null)
    setMessage(null)
    try {
      if (await hasActiveWorkout()) {
        setError(
          'Finish or discard the workout in progress first because merging exercises would change it underneath you.',
        )
        return
      }
      const fixes = await scanExerciseFixes()
      if (fixes.length > 0) setExerciseFixes(fixes)
      else setMessage('Every exercise is already matched to the library.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not scan your exercises.')
    }
  }

  async function doFixExercises() {
    setExerciseFixes(null)
    try {
      const r = await applyExerciseFixes()
      const parts: string[] = []
      if (r.merged > 0) parts.push(`merged ${r.merged} exercise(s) into the library across ${r.workouts} workout(s)`)
      if (r.reclassified > 0) parts.push(`gave ${r.reclassified} exercise(s) a muscle group`)
      setMessage(parts.length > 0 ? `Exercises matched: ${parts.join(', ')}.` : 'Nothing needed matching.')
      setError(null)
      track('exercise_match_run')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not match your exercises.')
    }
  }

  async function doWipe() {
    setConfirmWipe(false)
    restTimer.stop()
    await wipeAllData()
    // Restore the built-in library so the app is usable straight afterwards.
    await initDb()
    setMessage('All data deleted.')
  }

  return {
    fileRef,
    backupStatus,
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
    exportBackup,
    onFilePicked,
    confirmStrongUnits,
    doImport,
    doUndoRestore,
    doCsvImport,
    scanHistory,
    doRepairHistory,
    scanExercises,
    doFixExercises,
    doWipe,
  }
}

export type DataTransfer = ReturnType<typeof useDataTransfer>
