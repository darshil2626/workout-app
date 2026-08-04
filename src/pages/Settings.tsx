import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, initDb } from '../db/db'
import type { DistanceUnit, Exercise, LengthUnit, WeightUnit } from '../db/types'
import { Header } from '../components/Header'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { updateSettings, useSettings } from '../lib/useSettings'
import { formatDuration } from '../lib/time'
import { displayToKg, formatWeight, parseNumber } from '../lib/units'
import { downloadBackup, restoreBackup, wipeAllData, type ImportSummary } from '../lib/backup'
import { BAR_PRESETS_KG, PLATE_PRESETS } from '../lib/plates'
import { useRestTimer } from '../state/RestTimerContext'
import { detectFormat } from '../lib/importers/detect'
import { parseStrongCsv, sniffStrongDisclosedUnits } from '../lib/importers/strong'
import { parseHevyCsv } from '../lib/importers/hevy'
import { applyCsvImport } from '../lib/importers/apply'
import type { ParsedImport } from '../lib/importers/shared'

const REST_PRESETS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
const STEP_PRESETS_KG = [0.5, 1, 1.25, 2.5, 5]

function describeCsvPreview(parsed: ParsedImport): string {
  const sourceLabel = parsed.source === 'strong' ? 'Strong' : 'Hevy'
  const dates = parsed.workouts.map((w) => w.startedAt)
  const earliest = new Date(Math.min(...dates)).toLocaleDateString()
  const latest = new Date(Math.max(...dates)).toLocaleDateString()
  const range = earliest === latest ? earliest : `${earliest} – ${latest}`
  const exerciseText =
    parsed.newExercises.length > 0 ? `, creating ${parsed.newExercises.length} new exercise(s)` : ''
  const warnText =
    parsed.warnings.length > 0 ? ` ${parsed.warnings.length} row(s) couldn't be read and were skipped.` : ''
  return `Adds ${parsed.workouts.length} workout(s) from ${sourceLabel} (${range})${exerciseText}. This does not remove anything already on this device.${warnText}`
}

export function SettingsPage() {
  const settings = useSettings()
  const restTimer = useRestTimer()
  const fileRef = useRef<HTMLInputElement>(null)

  const [restSheet, setRestSheet] = useState(false)
  const [stepSheet, setStepSheet] = useState(false)
  const [barSheet, setBarSheet] = useState(false)
  const [plateSheet, setPlateSheet] = useState(false)
  const [bodyweight, setBodyweight] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [pendingStrongText, setPendingStrongText] = useState<string | null>(null)
  const [strongWeightUnit, setStrongWeightUnit] = useState<WeightUnit>('kg')
  const [strongDistanceUnit, setStrongDistanceUnit] = useState<DistanceUnit>('km')
  const [csvPreview, setCsvPreview] = useState<ParsedImport | null>(null)

  const workoutCount = useLiveQuery(() => db.workouts.where('status').equals('done').count(), [], 0)
  const exerciseCount = useLiveQuery(() => db.exercises.count(), [], 0)
  const routineCount = useLiveQuery(() => db.routines.count(), [], 0)

  async function onFilePicked(file: File | undefined) {
    if (!file) return
    setError(null)
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
    if (format === 'ironlog') {
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
      setError('Unrecognized file. Expected an IronLog backup (.json), or a CSV export from Strong or Hevy.')
    }
  }

  async function previewCsv(build: (existing: Exercise[]) => ParsedImport) {
    try {
      const existing = await db.exercises.toArray()
      const parsed = build(existing)
      if (parsed.workouts.length === 0) {
        setError('No workouts were found in that file.')
        return
      }
      setCsvPreview(parsed)
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
        `Restored ${summary.workouts} workouts, ${summary.routines} routines, ${summary.exercises} exercises and ${summary.measurements} measurements.`,
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setPendingImport(null)
    }
  }

  async function doCsvImport() {
    if (!csvPreview) return
    const sourceLabel = csvPreview.source === 'strong' ? 'Strong' : 'Hevy'
    try {
      const summary = await applyCsvImport(csvPreview)
      const warnText =
        csvPreview.warnings.length > 0 ? ` ${csvPreview.warnings.length} row(s) were skipped.` : ''
      setMessage(
        `Added ${summary.workouts} workouts and ${summary.exercises} new exercises from ${sourceLabel}.${warnText}`,
      )
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
    } finally {
      setCsvPreview(null)
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

  function saveBodyweight() {
    const n = bodyweight === null ? null : parseNumber(bodyweight)
    void updateSettings({
      bodyweightKg: n === null ? null : displayToKg(n, settings.weightUnit),
    })
    setBodyweight(null)
  }

  return (
    <>
      <Header title="Settings" />
      <div className="page">
        {message && (
          <div className="card" style={{ borderColor: 'var(--success)', marginBottom: 12 }}>
            <p className="muted">{message}</p>
          </div>
        )}
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}>
            <p style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>{error}</p>
          </div>
        )}

        <div className="section-title">Units</div>
        <div className="card">
          <div className="field">
            <span className="field-label">Weight</span>
            <div className="segmented">
              {(['kg', 'lb'] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  className={settings.weightUnit === u ? 'active' : ''}
                  onClick={() => void updateSettings({ weightUnit: u })}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">Distance</span>
            <div className="segmented">
              {(['km', 'mi'] as DistanceUnit[]).map((u) => (
                <button
                  key={u}
                  className={settings.distanceUnit === u ? 'active' : ''}
                  onClick={() => void updateSettings({ distanceUnit: u })}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">Body measurements</span>
            <div className="segmented">
              {(['cm', 'in'] as LengthUnit[]).map((u) => (
                <button
                  key={u}
                  className={settings.lengthUnit === u ? 'active' : ''}
                  onClick={() => void updateSettings({ lengthUnit: u })}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <p className="faint" style={{ marginTop: 10 }}>
            Everything is stored in kilograms and centimetres internally, so switching units never
            changes what you lifted or measured.
          </p>
        </div>

        <div className="section-title">Rest timer</div>
        <div className="card">
          <div className="row-between">
            <div className="stack grow">
              <span>Enable rest timer</span>
              <span className="faint">Show the countdown bar between sets</span>
            </div>
            <button
              className={`switch${settings.restTimerEnabled ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.restTimerEnabled}
              aria-label="Enable rest timer"
              onClick={() => void updateSettings({ restTimerEnabled: !settings.restTimerEnabled })}
            />
          </div>
          <div className="divider" />
          <div className="row-between">
            <div className="stack grow">
              <span>Start automatically</span>
              <span className="faint">When you tick a set complete</span>
            </div>
            <button
              className={`switch${settings.autoStartRestTimer ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.autoStartRestTimer}
              aria-label="Start rest timer automatically"
              onClick={() => void updateSettings({ autoStartRestTimer: !settings.autoStartRestTimer })}
            />
          </div>
          <div className="divider" />
          <button className="row-between" style={{ width: '100%' }} onClick={() => setRestSheet(true)}>
            <span className="grow" style={{ textAlign: 'left' }}>
              Default rest
            </span>
            <span className="muted mono">{formatDuration(settings.defaultRestSeconds)}</span>
          </button>
          <div className="divider" />
          <div className="row-between">
            <span className="grow">Sound when finished</span>
            <button
              className={`switch${settings.restTimerSound ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.restTimerSound}
              aria-label="Rest timer sound"
              onClick={() => void updateSettings({ restTimerSound: !settings.restTimerSound })}
            />
          </div>
          <div className="divider" />
          <div className="row-between">
            <div className="stack grow">
              <span>Vibrate when finished</span>
              <span className="faint">Android only; iOS does not allow it</span>
            </div>
            <button
              className={`switch${settings.restTimerVibrate ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.restTimerVibrate}
              aria-label="Rest timer vibration"
              onClick={() => void updateSettings({ restTimerVibrate: !settings.restTimerVibrate })}
            />
          </div>
          <div className="divider" />
          <button
            className="btn btn-ghost btn-sm btn-block"
            onClick={() => restTimer.start(settings.defaultRestSeconds)}
          >
            Test the timer
          </button>
        </div>

        <div className="section-title">Lifting</div>
        <div className="card">
          <button className="row-between" style={{ width: '100%' }} onClick={() => setStepSheet(true)}>
            <div className="stack grow" style={{ textAlign: 'left' }}>
              <span>Weight increment</span>
              <span className="faint">Smallest jump you can actually load</span>
            </div>
            <span className="muted mono">
              {formatWeight(settings.weightStepKg, settings.weightUnit)} {settings.weightUnit}
            </span>
          </button>
          <div className="divider" />
          <button className="row-between" style={{ width: '100%' }} onClick={() => setBarSheet(true)}>
            <div className="stack grow" style={{ textAlign: 'left' }}>
              <span>Barbell weight</span>
              <span className="faint">Used by the plate calculator</span>
            </div>
            <span className="muted mono">
              {formatWeight(settings.barWeightKg, settings.weightUnit)} {settings.weightUnit}
            </span>
          </button>
          <div className="divider" />
          <button className="row-between" style={{ width: '100%' }} onClick={() => setPlateSheet(true)}>
            <div className="stack grow" style={{ textAlign: 'left' }}>
              <span>Available plates</span>
              <span className="faint">What your gym actually stocks</span>
            </div>
            <span className="muted mono">
              {settings.availablePlatesKg
                .map((p) => formatWeight(p, settings.weightUnit))
                .join(', ')}
            </span>
          </button>
          <div className="divider" />
          <div className="field">
            <span className="field-label">Bodyweight ({settings.weightUnit})</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input grow"
                type="text"
                inputMode="decimal"
                value={
                  bodyweight ?? (settings.bodyweightKg === null ? '' : formatWeight(settings.bodyweightKg, settings.weightUnit))
                }
                onChange={(e) => setBodyweight(e.target.value)}
                placeholder="Not set"
                aria-label="Bodyweight"
              />
              <button className="btn btn-ghost" disabled={bodyweight === null} onClick={saveBodyweight}>
                Save
              </button>
            </div>
            <span className="faint">
              Used to score pull-ups, dips and other bodyweight movements. Leave blank and they
              count zero volume.
            </span>
          </div>
        </div>

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
            Everything lives on this device only. Export regularly — clearing your browser data or
            deleting the app will erase it.
          </p>
          <div className="list">
            <button className="btn btn-ghost btn-block" onClick={() => void downloadBackup()}>
              Export backup (.json)
            </button>
            <button className="btn btn-ghost btn-block" onClick={() => fileRef.current?.click()}>
              Import backup or CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json,text/csv,.csv"
              hidden
              onChange={(e) => void onFilePicked(e.target.files?.[0])}
            />
            <button className="btn btn-danger btn-block" onClick={() => setConfirmWipe(true)}>
              Delete all data
            </button>
          </div>
          <p className="faint" style={{ marginTop: 10 }}>
            Import accepts an IronLog backup (.json, replaces everything), or a CSV export from Strong
            or Hevy (added alongside what's already here).
          </p>
        </div>

        <div className="section-title">About</div>
        <div className="card">
          <p className="muted">
            IronLog is an offline-first workout tracker. Add it to your home screen and it behaves
            like a native app — no account, no subscription, no internet required.
          </p>
          <p className="faint" style={{ marginTop: 10 }}>
            iPhone: Share → Add to Home Screen. Android: menu → Install app.
          </p>
        </div>
      </div>

      <Sheet open={restSheet} title="Default rest" onClose={() => setRestSheet(false)}>
        {REST_PRESETS.map((s) => (
          <button
            key={s}
            className="sheet-list-item"
            onClick={() => {
              void updateSettings({ defaultRestSeconds: s })
              setRestSheet(false)
            }}
          >
            <span className="grow">{formatDuration(s)}</span>
            {settings.defaultRestSeconds === s && <span style={{ color: 'var(--accent)' }}>✓</span>}
          </button>
        ))}
      </Sheet>

      <Sheet open={stepSheet} title="Weight increment" onClose={() => setStepSheet(false)}>
        {STEP_PRESETS_KG.map((kg) => (
          <button
            key={kg}
            className="sheet-list-item"
            onClick={() => {
              void updateSettings({ weightStepKg: kg })
              setStepSheet(false)
            }}
          >
            <span className="grow">
              {formatWeight(kg, settings.weightUnit)} {settings.weightUnit}
            </span>
            {settings.weightStepKg === kg && <span style={{ color: 'var(--accent)' }}>✓</span>}
          </button>
        ))}
      </Sheet>

      <Sheet open={barSheet} title="Barbell weight" onClose={() => setBarSheet(false)}>
        {BAR_PRESETS_KG.map((kg) => (
          <button
            key={kg}
            className="sheet-list-item"
            onClick={() => {
              void updateSettings({ barWeightKg: kg })
              setBarSheet(false)
            }}
          >
            <span className="grow">
              {formatWeight(kg, settings.weightUnit)} {settings.weightUnit}
            </span>
            {Math.abs(settings.barWeightKg - kg) < 0.01 && (
              <span style={{ color: 'var(--accent)' }}>✓</span>
            )}
          </button>
        ))}
      </Sheet>

      <Sheet open={plateSheet} title="Available plates" onClose={() => setPlateSheet(false)}>
        <p className="muted" style={{ marginBottom: 12 }}>
          Pick the set that matches your gym. The calculator only suggests plates from this list.
        </p>
        {PLATE_PRESETS.map((preset) => {
          const selected =
            preset.platesKg.length === settings.availablePlatesKg.length &&
            preset.platesKg.every((p, i) => Math.abs(p - settings.availablePlatesKg[i]) < 0.01)
          return (
            <button
              key={preset.label}
              className="sheet-list-item"
              onClick={() => {
                void updateSettings({ availablePlatesKg: preset.platesKg })
                setPlateSheet(false)
              }}
            >
              <div className="stack grow">
                <span>{preset.label}</span>
                <span className="faint mono">
                  {preset.platesKg.map((p) => formatWeight(p, settings.weightUnit)).join(', ')}{' '}
                  {settings.weightUnit}
                </span>
              </div>
              {selected && <span style={{ color: 'var(--accent)' }}>✓</span>}
            </button>
          )
        })}
      </Sheet>

      <ConfirmSheet
        open={pendingImport !== null}
        title="Replace everything?"
        message="Importing overwrites all workouts, routines and exercises on this device with the contents of the backup file."
        confirmLabel="Import"
        destructive
        onConfirm={() => void doImport()}
        onCancel={() => setPendingImport(null)}
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
        <p className="muted" style={{ marginBottom: 14 }}>
          Strong's export doesn't record which units it used, so pick what your app was set to when
          you exported this file.
        </p>
        <div className="field">
          <span className="field-label">Weight</span>
          <div className="segmented">
            {(['kg', 'lb'] as WeightUnit[]).map((u) => (
              <button
                key={u}
                className={strongWeightUnit === u ? 'active' : ''}
                onClick={() => setStrongWeightUnit(u)}
              >
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className="field" style={{ marginTop: 14 }}>
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
