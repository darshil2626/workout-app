import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Measurement, MeasurementType } from '../db/types'
import { Header } from '../components/Header'
import { ConfirmSheet, Sheet } from '../components/Sheet'
import { ChartCard } from '../components/charts/ChartCard'
import { LineChart } from '../components/charts/LineChart'
import { useSettings } from '../lib/useSettings'
import {
  formatMeasurement,
  fromDisplayValue,
  MEASUREMENT_SPECS,
  specFor,
  unitLabel,
} from '../lib/measurements'
import { saveMeasurement } from '../lib/measurements'
import { parseNumber } from '../lib/units'
import { formatRelative } from '../lib/time'
import { IconPlus, IconTrash } from '../components/Icons'

/** Local date in yyyy-mm-dd for <input type="date">, which has no timezone. */
function toDateInput(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fromDateInput(text: string): number {
  const [y, m, d] = text.split('-').map(Number)
  if (!y || !m || !d) return Date.now()
  // Noon avoids a date shifting a day under daylight-saving transitions.
  return new Date(y, m - 1, d, 12).getTime()
}

export function MeasurementsPage() {
  const settings = useSettings()
  const [open, setOpen] = useState<MeasurementType | null>(null)
  const [detail, setDetail] = useState<MeasurementType | null>(null)

  const rows = useLiveQuery(() => db.measurements.toArray(), [], [] as Measurement[])

  const byType = useMemo(() => {
    const map = new Map<MeasurementType, Measurement[]>()
    for (const r of rows) map.set(r.type, [...(map.get(r.type) ?? []), r])
    for (const list of map.values()) list.sort((a, b) => b.takenAt - a.takenAt)
    return map
  }, [rows])

  return (
    <>
      <Header title="Measurements" back="/stats" />
      <div className="page">
        <p className="muted">
          Track bodyweight and circumferences over time. Logging bodyweight also lets the app score
          pull-ups, dips and other bodyweight exercises.
        </p>

        <div className="list" style={{ marginTop: 14 }}>
          {MEASUREMENT_SPECS.map((spec) => {
            const list = byType.get(spec.type) ?? []
            const latest = list[0]
            const previous = list[1]
            const delta =
              latest && previous ? latest.value - previous.value : null
            return (
              <div className="card" key={spec.type}>
                <div className="row-between">
                  <button
                    className="stack grow"
                    style={{ textAlign: 'left' }}
                    onClick={() => setDetail(spec.type)}
                    disabled={list.length === 0}
                  >
                    <span style={{ fontWeight: 650 }}>{spec.label}</span>
                    {latest ? (
                      <span className="faint">
                        {formatRelative(latest.takenAt)}
                        {delta !== null && delta !== 0
                          ? ` · ${delta > 0 ? '+' : '−'}${formatMeasurement(Math.abs(delta), spec.kind, settings)} since last`
                          : ''}
                      </span>
                    ) : (
                      <span className="faint">No entries yet</span>
                    )}
                  </button>
                  <div className="row" style={{ gap: 10 }}>
                    <span className="mono" style={{ fontWeight: 650 }}>
                      {latest
                        ? `${formatMeasurement(latest.value, spec.kind, settings)} ${unitLabel(spec.kind, settings)}`
                        : '—'}
                    </span>
                    <button
                      className="icon-btn"
                      onClick={() => setOpen(spec.type)}
                      aria-label={`Add ${spec.label} entry`}
                    >
                      <IconPlus />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <EntrySheet type={open} onClose={() => setOpen(null)} />
      <HistorySheet
        type={detail}
        entries={detail ? (byType.get(detail) ?? []) : []}
        onClose={() => setDetail(null)}
      />
    </>
  )
}

function EntrySheet({ type, onClose }: { type: MeasurementType | null; onClose: () => void }) {
  const settings = useSettings()
  const [value, setValue] = useState('')
  const [date, setDate] = useState(() => toDateInput(Date.now()))
  const [error, setError] = useState<string | null>(null)

  const spec = type ? specFor(type) : null

  async function save() {
    if (!type || !spec) return
    const n = parseNumber(value)
    if (n === null || n <= 0) {
      setError('Enter a number greater than zero.')
      return
    }
    if (spec.kind === 'percent' && n > 100) {
      setError('Body fat percentage cannot exceed 100.')
      return
    }
    await saveMeasurement(type, fromDisplayValue(n, spec.kind, settings), fromDateInput(date))
    setValue('')
    setError(null)
    onClose()
  }

  return (
    <Sheet
      open={type !== null}
      title={spec ? `Add ${spec.label.toLowerCase()}` : ''}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="list" style={{ gap: 14 }}>
        <div className="field">
          <label className="field-label" htmlFor="m-value">
            Value ({spec ? unitLabel(spec.kind, settings) : ''})
          </label>
          <input
            id="m-value"
            className="input"
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="m-date">
            Date
          </label>
          <input
            id="m-date"
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}
      </div>
    </Sheet>
  )
}

function HistorySheet({
  type,
  entries,
  onClose,
}: {
  type: MeasurementType | null
  entries: Measurement[]
  onClose: () => void
}) {
  const settings = useSettings()
  const [deleting, setDeleting] = useState<Measurement | null>(null)
  const spec = type ? specFor(type) : null

  // Charts read left-to-right in time; the list below reads newest-first.
  const points = useMemo(
    () =>
      [...entries]
        .sort((a, b) => a.takenAt - b.takenAt)
        .map((e) => ({ date: e.takenAt, value: e.value })),
    [entries],
  )

  if (!type || !spec) return null

  const unit = unitLabel(spec.kind, settings)

  return (
    <>
      <Sheet open title={spec.label} onClose={onClose}>
        <ChartCard
          title={`${spec.label} over time`}
          subtitle={`Measured in ${unit}`}
          table={{
            columns: [{ header: 'Date' }, { header: unit, numeric: true }],
            rows: [...entries].map((e) => [
              new Date(e.takenAt).toLocaleDateString(),
              formatMeasurement(e.value, spec.kind, settings),
            ]),
          }}
          empty="Log at least one entry to see a chart."
        >
          <LineChart
            points={points}
            // Body measurements never go near zero, so frame their own range.
            baseline="auto"
            formatValue={(v) => `${formatMeasurement(v, spec.kind, settings)} ${unit}`}
            formatDate={(ts) =>
              new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
            }
          />
        </ChartCard>

        <div className="section-title">Entries</div>
        {entries.map((e) => (
          <div className="row-between" key={e.id} style={{ padding: '9px 2px', borderBottom: '1px solid var(--border)' }}>
            <span className="muted">{new Date(e.takenAt).toLocaleDateString()}</span>
            <div className="row" style={{ gap: 10 }}>
              <span className="mono" style={{ fontWeight: 650 }}>
                {formatMeasurement(e.value, spec.kind, settings)} {unit}
              </span>
              <button className="icon-btn" onClick={() => setDeleting(e)} aria-label="Delete entry">
                <IconTrash />
              </button>
            </div>
          </div>
        ))}
      </Sheet>

      <ConfirmSheet
        open={deleting !== null}
        title="Delete entry?"
        message={
          deleting
            ? `${new Date(deleting.takenAt).toLocaleDateString()} — ${formatMeasurement(deleting.value, spec.kind, settings)} ${unit}`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleting) void db.measurements.delete(deleting.id)
          setDeleting(null)
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  )
}
