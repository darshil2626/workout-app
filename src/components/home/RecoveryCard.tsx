import { RECOVERY_STALE_DAYS, type MuscleRecovery } from '../../lib/home'

interface Props {
  /** `muscleRecovery`'s output — already most-rested first. */
  items: MuscleRecovery[]
  limit?: number
}

/**
 * What has rested and what has been neglected, as a day count per muscle.
 *
 * This used to carry a Recovering/Ready/Overdue chip alongside the count, but
 * with `REST_OVERDUE_DAYS` tight relative to `RECOVERY_STALE_DAYS`, "Overdue"
 * was the state for most of a row's lifetime on screen — a label that's true
 * five days out of every seven stops reading as information. The day count
 * was already doing the real work (that and the most-neglected-first sort),
 * so the chip is gone and the count itself carries the urgency, in color.
 */
export function RecoveryCard({ items, limit = 5 }: Props) {
  const shown = items.slice(0, limit)

  return (
    <section className="home-sect">
      <div className="section-title">Ready to train</div>
      <div className="card">
        {shown.map((item) => (
          <div className="home-rest-row" key={item.muscle}>
            <span className="truncate">{item.muscle}</span>
            <span className={`home-rest-days t${restTier(item.daysSince)}`}>
              {restLabel(item.daysSince)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function restLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days`
}

/**
 * Faint → ember in four steps, quartiles of `RECOVERY_STALE_DAYS` — a muscle
 * just trained reads as quiet text, one nearing the stale cutoff reads in
 * full accent. Fixed steps rather than a continuous `color-mix()` so the
 * ramp stays easy to eyeball and retune, the same way the calendar heat bar
 * (`--heat-0`…`--heat-4`) is a small fixed set rather than a formula.
 */
function restTier(days: number): 0 | 1 | 2 | 3 {
  const share = days / RECOVERY_STALE_DAYS
  if (share <= 0.25) return 0
  if (share <= 0.5) return 1
  if (share <= 0.75) return 2
  return 3
}
