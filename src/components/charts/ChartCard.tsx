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
  /** Filter controls sit above the plot, scoping only this card's data. */
  controls?: ReactNode
  /** The WCAG-clean twin of the chart; every plotted value must appear here. */
  table: TableData
  empty?: string
  children: ReactNode
}

/**
 * Wraps a chart with its title and a table-view toggle.
 * The table is not optional: it is how the values stay reachable without
 * relying on colour or hover.
 */
export function ChartCard({ title, subtitle, controls, table, empty, children }: Props) {
  const [showTable, setShowTable] = useState(false)
  const isEmpty = table.rows.length === 0

  return (
    <section className="chart-card">
      <div className="chart-head">
        <div className="stack grow">
          <h3 className="chart-title">{title}</h3>
          {subtitle ? <span className="faint">{subtitle}</span> : null}
        </div>
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

      {isEmpty ? (
        <p className="muted chart-empty">{empty ?? 'Not enough data yet.'}</p>
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
