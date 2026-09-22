import type { MuscleRecovery } from '../../lib/home'

/**
 * Rest is capped rather than scaled to the longest gap: one muscle untouched
 * since March would otherwise squash every other bar to a stub, and the
 * difference between 40 days and 60 days of rest carries no training meaning
 * anyway. Past two weeks, "a long time" is the whole message.
 */
const CAP_DAYS = 14

interface Props {
  /** `muscleRecovery`'s output — already most-rested first. */
  items: MuscleRecovery[]
  limit?: number
}

export function RecoveryCard({ items, limit = 5 }: Props) {
  const shown = items.slice(0, limit)

  return (
    <section className="home-sect">
      <div className="section-title">Ready to train</div>
      <div className="card">
        <div className="bar-list">
          {shown.map((item) => (
            <div className="bar-row" key={item.muscle}>
              <span className="bar-label truncate">{item.muscle}</span>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  // A floor of 4%: trained-today still needs a visible bar, or
                  // the row reads as missing data rather than as no rest.
                  style={{ width: `${Math.max((Math.min(item.daysSince, CAP_DAYS) / CAP_DAYS) * 100, 4)}%` }}
                />
              </div>
              <span className="bar-value home-rest">{restLabel(item.daysSince)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function restLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days`
}
