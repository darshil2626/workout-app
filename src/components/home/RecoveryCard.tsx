import { restState, type MuscleRecovery, type RestState } from '../../lib/home'

const STATE_LABEL: Record<RestState, string> = {
  recovering: 'Recovering',
  ready: 'Ready',
  overdue: 'Overdue',
}

interface Props {
  /** `muscleRecovery`'s output — already most-rested first. */
  items: MuscleRecovery[]
  limit?: number
}

/**
 * What has rested and what has been neglected, as a word per muscle.
 *
 * This used to be a bar filled against a 14-day ceiling that appeared nowhere
 * on screen, so a half-full bar was unreadable: the user could tell one muscle
 * from another but not what either bar was a fraction *of*. A named state and
 * a day count say the same thing and can be acted on without decoding.
 *
 * The thresholds behind the three states are rules of thumb, not physiology —
 * see `restState` in lib/home for why, and tune them there.
 *
 * Ember marks Ready because ember means "act" everywhere else in the app, and
 * a rested muscle is the one thing here you could go and train right now.
 * Green is never used: it belongs to a completed set and nothing else.
 */
export function RecoveryCard({ items, limit = 5 }: Props) {
  const shown = items.slice(0, limit)

  return (
    <section className="home-sect">
      <div className="section-title">Ready to train</div>
      <div className="card">
        {shown.map((item) => {
          const state = restState(item.daysSince)
          return (
            <div className="home-rest-row" key={item.muscle}>
              <span className="truncate">{item.muscle}</span>
              <span className={`home-rest-chip ${state}`}>{STATE_LABEL[state]}</span>
              <span className="home-rest-days">{restLabel(item.daysSince)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function restLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days`
}
