import { TREND_WEEKS, type StrengthLift } from '../../lib/home'
import type { Formatters } from '../../lib/useSettings'
import { Sparkline } from './Sparkline'

interface Props {
  /** `strengthTrend`'s output. Callers must not render this empty. */
  lifts: StrengthLift[]
  fmt: Formatters
}

/**
 * Estimated 1RM for the two or three lifts trained most often, over the last
 * eight weeks.
 *
 * This took the place of a weekly-volume chart, which was both a duplicate of
 * the Stats page and the wrong question: tonnage rises the moment you add a
 * set, so it looked like an answer to "am I getting stronger?" while actually
 * answering "did I do more work?". On a screen meant for deciding what to do
 * today, only the first one earns its space.
 *
 * Estimated, not measured — nobody tests a true single every week — so the
 * sparkline carries the shape and the delta carries the size, and neither is
 * given a decimal place it hasn't earned.
 */
export function StrengthTrend({ lifts, fmt }: Props) {
  return (
    <section className="home-sect home-appear">
      <div className="section-title">Strength trend</div>
      <div className="card">
        {lifts.map((lift) => (
          <div className="home-trend" key={lift.exerciseId}>
            <div className="stack grow">
              <span className="truncate">{lift.name}</span>
              <span className={lift.deltaKg > 0 ? 'home-trend-delta up' : 'home-trend-delta'}>
                {describeDelta(lift.deltaKg, fmt)}
              </span>
            </div>
            <Sparkline values={lift.series} />
            <span className="home-trend-now mono">
              {formatOneRm(lift.currentKg, fmt)}
              <span className="home-trend-unit"> {fmt.weightUnit}</span>
            </span>
          </div>
        ))}
        <p className="home-trend-foot">
          Estimated 1RM · change across the last {TREND_WEEKS} weeks
        </p>
      </div>
    </section>
  )
}

/**
 * One decimal, matching how the exercise detail screen prints a 1RM record —
 * the two must not disagree about the same number. Rounded in kilograms and
 * then handed to the formatter, so a user logging in pounds still gets pounds.
 */
function formatOneRm(kg: number, fmt: Formatters): string {
  return fmt.weight(Math.round(kg * 10) / 10)
}

/**
 * A fall is stated plainly and never coloured red. Deloads, illness, a bad
 * week at work and a heavier rep range all pull an estimate down, and painting
 * those as failure turns an honest record of training into an accusation.
 *
 * "Holding steady" covers anything that rounds away to nothing, so the card
 * never prints "+0 kg" off a rounding crumb.
 */
function describeDelta(deltaKg: number, fmt: Formatters): string {
  const text = formatOneRm(Math.abs(deltaKg), fmt)
  if (text === '' || Number(text) === 0) return 'Holding steady'
  return `${deltaKg > 0 ? '+' : '−'}${text} ${fmt.weightUnit}`
}
