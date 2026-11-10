import { IconPlus } from '../Icons'

interface Props {
  onNewToLifting: () => void
  onStartEmpty: () => void
  onSwitching: () => void
  onNewRoutine: () => void
}

/**
 * Nothing logged, nothing planned, nothing running.
 *
 * One optional question instead of an onboarding flow. New users mostly arrive
 * as one of three people: a beginner who wants a plan handed to them, someone
 * who already trains and wants to log today's session, or someone leaving
 * Strong or Hevy with their history. Each card is one tap to the right place,
 * and nothing is asked that the app does not use.
 */
export function FirstRun({ onNewToLifting, onStartEmpty, onSwitching, onNewRoutine }: Props) {
  return (
    <>
      <h2 className="first-run-title">How do you want to start?</h2>

      <div className="list first-run-choices">
        <button className="card card-tappable first-run-card" onClick={onNewToLifting}>
          <span className="first-run-card-title">I’m new to lifting</span>
          <span className="first-run-card-body">Pick a simple starter routine and begin your first session.</span>
        </button>
        <button className="card card-tappable first-run-card" onClick={onStartEmpty}>
          <span className="first-run-card-title">I already lift</span>
          <span className="first-run-card-body">Start an empty workout and add exercises as you go.</span>
        </button>
        <button className="card card-tappable first-run-card" onClick={onSwitching}>
          <span className="first-run-card-title">I’m switching from another app</span>
          <span className="first-run-card-body">
            Import your history from a Strong or Hevy CSV. Nothing leaves your phone.
          </span>
        </button>
      </div>

      <button className="btn btn-ghost btn-block" onClick={onNewRoutine}>
        <IconPlus />
        Build a routine first
      </button>
    </>
  )
}
