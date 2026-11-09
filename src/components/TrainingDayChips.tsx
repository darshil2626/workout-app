import { orderedWeekdays, toggleDay, WEEKDAY_LONG, WEEKDAY_SHORT } from '../lib/trainingDays'

interface Props {
  value: number[]
  firstDayOfWeek: 0 | 1
  onChange: (days: number[]) => void
}

/** Seven toggles in the person's week order; shared by the finish step and Settings. */
export function TrainingDayChips({ value, firstDayOfWeek, onChange }: Props) {
  return (
    <div className="rpe-row" role="group" aria-label="Training days" style={{ flexWrap: 'wrap' }}>
      {orderedWeekdays(firstDayOfWeek).map((d) => (
        <button
          key={d}
          type="button"
          className={`chip${value.includes(d) ? ' active' : ''}`}
          aria-label={WEEKDAY_LONG[d]}
          aria-pressed={value.includes(d)}
          onClick={() => onChange(toggleDay(value, d))}
        >
          {WEEKDAY_SHORT[d]}
        </button>
      ))}
    </div>
  )
}
