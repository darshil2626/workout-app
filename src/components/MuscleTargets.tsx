import type { Exercise } from '../db/types'

/**
 * Which muscles an exercise trains. Primary and secondary get their own
 * labeled rows rather than a color-only distinction — an accent chip next to
 * a plain one reads as "some emphasis, unclear which way" until you already
 * know the convention.
 */
export function MuscleTargets({ exercise }: { exercise: Exercise }) {
  const secondary = exercise.secondaryMuscles ?? []

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="muscle-target-row">
        <span className="muted">Primary</span>
        <div className="chips-wrap">
          <span className="chip active">{exercise.muscleGroup}</span>
        </div>
      </div>
      {secondary.length > 0 ? (
        <div className="muscle-target-row" style={{ marginTop: 10 }}>
          <span className="muted">Secondary</span>
          <div className="chips-wrap">
            {secondary.map((muscle) => (
              <span className="chip" key={muscle}>
                {muscle}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
