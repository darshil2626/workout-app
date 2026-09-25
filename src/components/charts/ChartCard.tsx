import { useState, type ReactNode } from 'react'

export interface TableColumn {
  header: string
  /** Right-aligned numeric columns get tabular figures for vertical alignment. */
  numeric?: boolean
}

export interface TableData {
  columns: TableColumn[]
  rows: (string | number)[][]
}

interface Props {
  title: string
  subtitle?: ReactNode
  /** A secondary header button beside the Table toggle, e.g. a link to a fuller page. */
  action?: ReactNode
  /** Filter controls sit above the plot, scoping only this card's data. */
  controls?: ReactNode
  /**
   * Range selection gets its own row below `controls`. Sharing one scrolling
   * row meant the ranges were pushed off-screen behind the metric chips, so
   * changing the time span took a scroll before it took a tap.
   */
  ranges?: ReactNode
  /** The WCAG-clean twin of the chart; every plotted value must appear here. */
  table: TableData
  empty?: string
  /**
   * A richer empty state for a brand-new user: a dimmed preview of what the
   * filled chart looks like, plus one sentence, plus an optional call to
   * action — rather than the plain `empty` sentence alone. When both are
   * given, this takes over.
   */
  emptyState?: { preview: ReactNode; message: string; cta?: ReactNode }
  /**
   * Overrides the automatic "no rows" emptiness check. Some tables always
   * have one row per period (e.g. one per week, whether or not that week had
   * any training) so `table.rows.length === 0` never fires even when every
   * value in the window is zero — this lets the caller say so explicitly.
   */
  forceEmpty?: boolean
  children: ReactNode
}

/**
 * Wraps a chart with its title and a table-view toggle.
 * The table is not optional: it is how the values stay reachable without
 * relying on colour or hover.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  controls,
  ranges,
  table,
  empty,
  emptyState,
  forceEmpty,
  children,
}: Props) {
  const [showTable, setShowTable] = useState(false)
  const isEmpty = table.rows.length === 0 || Boolean(forceEmpty)

  return (
    <section className="chart-card">
      <div className="chart-head">
        <div className="stack grow">
          <h3 className="chart-title">{title}</h3>
          {subtitle ? <span className="faint">{subtitle}</span> : null}
        </div>
        {action}
        {!isEmpty && (
          <button
            className="chart-toggle"
            onClick={() => setShowTable((v) => !v)}
            aria-pressed={showTable}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>

      {controls ? <div className="chart-controls">{controls}</div> : null}
      {ranges ? <div className="chart-ranges">{ranges}</div> : null}

      {isEmpty ? (
        emptyState ? (
          <div className="chart-empty">
            <div className="chart-empty-preview" aria-hidden="true">{emptyState.preview}</div>
            <p className="muted">{emptyState.message}</p>
            {emptyState.cta}
          </div>
        ) : (
          <p className="muted chart-empty">{empty ?? 'Not enough data yet.'}</p>
        )
      ) : showTable ? (
        <div className="chart-table-wrap">
          <table className="chart-table">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c.header} className={c.numeric ? 'num' : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={table.columns[j]?.numeric ? 'num' : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  )
}
