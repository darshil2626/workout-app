export interface BarItem {
  label: string
  value: number
  /** Secondary figure shown beside the value, e.g. volume next to set count. */
  detail?: string
}

interface Props {
  items: BarItem[]
  formatValue: (v: number) => string
}

/**
 * Horizontal bars for nominal categories with long names.
 * Every bar shares one hue: the categories have no natural order, so shading
 * them by size would double-encode the length the bar already shows.
 */
export function BarList({ items, formatValue }: Props) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.label}>
          <span className="bar-label truncate">{item.label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${Math.max((item.value / max) * 100, 1.5)}%` }}
            />
          </div>
          <span className="bar-value mono">
            {formatValue(item.value)}
            {item.detail ? <span className="bar-detail"> {item.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  )
}
