import { EXERCISE_ART_ENABLED } from '../lib/features'
import { listDoneWorkouts } from '../db/repo'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { DistanceUnit, LengthUnit, Theme, WeightUnit, Workout } from '../db/types'
import { Header } from '../components/Header'
import { Sheet } from '../components/Sheet'
import { updateSettings, useSettings } from '../lib/useSettings'
import { formatDuration } from '../lib/time'
import { displayToKg, formatWeight, parseNumber } from '../lib/units'
import { BAR_PRESETS_KG, PLATE_PRESETS } from '../lib/plates'
import { measurementWeightUnit } from '../lib/measurements'
import { suggestedWeeklyGoal } from '../lib/home'
import { recomputeAllWorkoutTotals } from '../lib/dedupe'
import { track } from '../lib/analytics'
import { PRIVACY_URL } from '../lib/links'
import { InstallSteps } from '../components/InstallSteps'
import { useInstall } from '../lib/install'
import { DataDialogs, DataSection } from './settings/DataSection'
import { useDataTransfer } from './settings/useDataTransfer'

const REST_PRESETS = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300]
const STEP_PRESETS_KG = [0.5, 1, 1.25, 2.5, 5]

export function SettingsPage() {
  const { installed } = useInstall()
  const settings = useSettings()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const data = useDataTransfer({ setMessage, setError })

  const [restSheet, setRestSheet] = useState(false)
  const [stepSheet, setStepSheet] = useState(false)
  const [barSheet, setBarSheet] = useState(false)
  const [plateSheet, setPlateSheet] = useState(false)
  const [bodyweight, setBodyweight] = useState<string | null>(null)
  // Set while a bulk rewrite of stored history is in flight.
  const [busy, setBusy] = useState(false)

  // Only the session timestamps are needed, but Dexie has no projection, so
  // this pulls the rows. It is the same read the Stats page already does, and
  // it only runs while Settings is open.
  const doneWorkouts = useLiveQuery(() => listDoneWorkouts(), [], [] as Workout[])
  const suggestedGoal = suggestedWeeklyGoal(doneWorkouts, settings.firstDayOfWeek)

  /**
   * History lists read each session's cached totals, so flipping this has to
   * re-total every stored workout or the numbers would disagree with the rule.
   */
  async function toggleWarmupSets() {
    setBusy(true)
    setError(null)
    try {
      await updateSettings({ countWarmupSets: !settings.countWarmupSets })
      const changed = await recomputeAllWorkoutTotals()
      setMessage(
        changed === 0
          ? 'Warm-up setting updated.'
          : `Warm-up setting updated. ${changed} session${changed === 1 ? '' : 's'} re-totalled.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update that setting.')
    } finally {
      setBusy(false)
    }
  }

  function saveBodyweight() {
    const n = bodyweight === null ? null : parseNumber(bodyweight)
    void updateSettings({
      bodyweightKg: n === null ? null : displayToKg(n, measurementWeightUnit(settings)),
    })
    setBodyweight(null)
  }

  return (
    <>
      <Header title="Settings" back />
      <div className="page">
        {message && (
          <div className="card" style={{ borderColor: 'var(--success)', marginBottom: 12 }}>
            <p className="muted">{message}</p>
          </div>
        )}
        {error && (
          <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 12 }}>
            <p style={{ color: 'var(--danger)', fontSize: 'var(--text-base)' }}>{error}</p>
          </div>
        )}

        <div className="section-title">Appearance</div>
        <div className="card">
          <div className="field">
            <span className="field-label">Theme</span>
            <div className="segmented">
              {(['light', 'dark', 'system'] as Theme[]).map((t) => (
                <button
                  key={t}
                  className={settings.theme === t ? 'active' : ''}
                  onClick={() => {
                    void updateSettings({ theme: t })
                    track('theme_changed', { theme: t })
                  }}
                >
                  {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </div>
        </div>

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
          <div className="field" style={{ marginTop: 12 }}>
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
          <div className="field" style={{ marginTop: 12 }}>
            <span className="field-label">Bodyweight</span>
            <div className="segmented">
              {(['kg', 'lb'] as WeightUnit[]).map((u) => (
                <button
                  key={u}
                  className={measurementWeightUnit(settings) === u ? 'active' : ''}
                  onClick={() => void updateSettings({ measurementWeightUnit: u })}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
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
            Bodyweight has its own unit, so you can lift in one and weigh yourself in the other. Everything is stored in
            kilograms and centimetres internally, so switching units never changes what you lifted or measured.
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
        </div>

        <div className="section-title">Lifting</div>
        <div className="card">
          <div className="row-between">
            <div className="stack grow">
              <span>Count warm-up sets</span>
              <span className="faint">
                Include them in volume, set counts and records. Off by default because a warm-up is preparation and not
                a training stimulus.
              </span>
            </div>
            <button
              className={`switch${settings.countWarmupSets ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.countWarmupSets}
              aria-label="Count warm-up sets"
              disabled={busy}
              onClick={() => void toggleWarmupSets()}
            />
          </div>
          <div className="divider" />
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
              {settings.availablePlatesKg.map((p) => formatWeight(p, settings.weightUnit)).join(', ')}
            </span>
          </button>
          <div className="divider" />
          <div className="field">
            <span className="field-label">Bodyweight ({measurementWeightUnit(settings)})</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input grow"
                type="text"
                inputMode="decimal"
                value={
                  bodyweight ??
                  (settings.bodyweightKg === null
                    ? ''
                    : formatWeight(settings.bodyweightKg, measurementWeightUnit(settings)))
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
              Used to score pull-ups, dips and other bodyweight movements. Leave blank and they count zero volume.
            </span>
          </div>
          <div className="divider" />
          <div className="row-between">
            <div className="stack grow">
              <span>Weekly goal</span>
              <span className="faint">
                {suggestedGoal === null
                  ? 'Workouts per week the home screen aims at. Train for a few weeks and this will suggest a number from your own history.'
                  : `Workouts per week the home screen aims at. You've averaged ${suggestedGoal} a week over the last couple of months.`}
              </span>
            </div>
            <div className="row" style={{ gap: 4 }}>
              <button
                className="icon-btn"
                aria-label="Decrease weekly goal"
                disabled={settings.weeklyGoalWorkouts <= 1}
                onClick={() =>
                  void updateSettings({ weeklyGoalWorkouts: Math.max(1, settings.weeklyGoalWorkouts - 1) })
                }
              >
                −
              </button>
              <span className="mono" style={{ fontWeight: 650, minWidth: 18, textAlign: 'center' }}>
                {settings.weeklyGoalWorkouts}
              </span>
              <button
                className="icon-btn"
                aria-label="Increase weekly goal"
                disabled={settings.weeklyGoalWorkouts >= 14}
                onClick={() =>
                  void updateSettings({ weeklyGoalWorkouts: Math.min(14, settings.weeklyGoalWorkouts + 1) })
                }
              >
                +
              </button>
            </div>
          </div>
        </div>

        <DataSection data={data} />

        <div className="section-title">Privacy</div>
        <div className="card">
          <div className="row-between">
            <div className="stack grow">
              <span>Share anonymous usage data</span>
              <span className="faint">
                Which screens and features get used, and whether the app gets reopened but never your workouts,
                routines, weights or measurements. Helps me improve Trana while it's early. Off until you say yes.{' '}
                <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                  Privacy policy
                </a>
              </span>
            </div>
            <button
              className={`switch${settings.analyticsEnabled && settings.analyticsConsentAt !== null ? ' on' : ''}`}
              role="switch"
              aria-checked={settings.analyticsEnabled && settings.analyticsConsentAt !== null}
              aria-label="Share anonymous usage data"
              onClick={() =>
                void updateSettings({ analyticsEnabled: !settings.analyticsEnabled, analyticsConsentAt: Date.now() })
              }
            />
          </div>
        </div>

        <div className="section-title">About</div>
        <div className="card">
          <p className="muted">
            Trana is an offline-first workout tracker. Add it to your home screen and it behaves like a native app and
            needs no account or subscription or internet.
          </p>
          {installed ? (
            <p className="faint" style={{ marginTop: 10 }}>
              Installed. You're running Trana as an app.
            </p>
          ) : (
            <>
              <div className="section-title" style={{ marginTop: 14 }}>
                Install
              </div>
              <InstallSteps />
            </>
          )}
          <p className="faint mono" style={{ marginTop: 10 }}>
            Build {__BUILD_ID__}
          </p>
          {EXERCISE_ART_ENABLED && (
            <p className="faint" style={{ marginTop: 10 }}>
              Exercise illustrations by Bryl Lim and Everkinetic, licensed{' '}
              <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">
                CC BY-SA 4.0
              </a>
              .
            </p>
          )}
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
            {Math.abs(settings.barWeightKg - kg) < 0.01 && <span style={{ color: 'var(--accent)' }}>✓</span>}
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
                  {preset.platesKg.map((p) => formatWeight(p, settings.weightUnit)).join(', ')} {settings.weightUnit}
                </span>
              </div>
              {selected && <span style={{ color: 'var(--accent)' }}>✓</span>}
            </button>
          )
        })}
      </Sheet>

      <DataDialogs data={data} />
    </>
  )
}
