import { Sheet } from './Sheet'
import { groupPlates, solvePlates } from '../lib/plates'
import { useFormatters } from '../lib/useSettings'
import { formatWeight } from '../lib/units'

interface Props {
  open: boolean
  /** Target total including the bar, in kilograms. Null when the set is blank. */
  targetKg: number | null
  onClose: () => void
}

/** Shows what to hang on each side of the bar to reach a set's weight. */
export function PlateCalculator({ open, targetKg, onClose }: Props) {
  const fmt = useFormatters()
  const { barWeightKg, availablePlatesKg, weightUnit } = fmt.settings

  const solution = targetKg === null ? null : solvePlates(targetKg, barWeightKg, availablePlatesKg)
  const groups = solution ? groupPlates(solution.perSide) : []

  return (
    <Sheet open={open} title="Plate calculator" onClose={onClose}>
      {targetKg === null ? (
        <p className="muted">Enter a weight for this set first.</p>
      ) : solution === null ? (
        <p className="muted">
          {formatWeight(targetKg, weightUnit)} {weightUnit} is less than the bar (
          {formatWeight(barWeightKg, weightUnit)} {weightUnit}). Change the bar weight in Settings if
          you use a lighter one.
        </p>
      ) : (
        <>
          <div className="plate-target">
            <span className="plate-target-value">
              {formatWeight(targetKg, weightUnit)} {weightUnit}
            </span>
            <span className="faint">
              bar {formatWeight(barWeightKg, weightUnit)} {weightUnit} + plates
            </span>
          </div>

          {groups.length === 0 ? (
            <p className="muted" style={{ marginTop: 14 }}>
              Just the bar — no plates needed.
            </p>
          ) : (
            <>
              <div className="field-label" style={{ marginTop: 16 }}>
                Per side
              </div>
              <div className="plate-list">
                {groups.map(({ plate, count }) => (
                  <div className="plate-row" key={plate}>
                    <span className="plate-chip">{formatWeight(plate, weightUnit)}</span>
                    <span className="grow muted">
                      {formatWeight(plate, weightUnit)} {weightUnit}
                    </span>
                    <span className="mono" style={{ fontWeight: 650 }}>
                      × {count}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {solution.remainderKg > 0.01 && (
            <p className="plate-warning">
              Closest loadable weight is {formatWeight(solution.achievedKg, weightUnit)}{' '}
              {weightUnit} — {formatWeight(solution.remainderKg * 2, weightUnit)} {weightUnit} short.
              Add smaller plates to your inventory in Settings if you have them.
            </p>
          )}
        </>
      )}
    </Sheet>
  )
}
