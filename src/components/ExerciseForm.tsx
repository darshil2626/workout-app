import { useEffect, useState } from 'react'
import { db, newId } from '../db/db'
import type { Equipment, Exercise, ExerciseKind, MuscleGroup } from '../db/types'
import { Sheet } from './Sheet'

export const MUSCLE_GROUPS: MuscleGroup[] = [
  'Chest',
  'Back',
  'Shoulders',
  'Biceps',
  'Triceps',
  'Forearms',
  'Quadriceps',
  'Hamstrings',
  'Glutes',
  'Calves',
  'Abs',
  'Traps',
  'Neck',
  'Full Body',
  'Cardio',
  'Other',
]

export const EQUIPMENT: Equipment[] = [
  'Barbell',
  'Dumbbell',
  'Machine',
  'Cable',
  'Bodyweight',
  'Kettlebell',
  'Band',
  'Plate',
  'Smith Machine',
  'Other',
]

const KINDS: { value: ExerciseKind; label: string }[] = [
  { value: 'weight_reps', label: 'Weight & Reps' },
  { value: 'bodyweight_reps', label: 'Bodyweight Reps' },
  { value: 'weighted_bodyweight', label: 'Weighted Bodyweight' },
  { value: 'assisted_bodyweight', label: 'Assisted Bodyweight' },
  { value: 'duration', label: 'Duration' },
  { value: 'duration_weight', label: 'Duration & Weight' },
  { value: 'distance_duration', label: 'Distance & Duration' },
  { value: 'reps_only', label: 'Reps Only' },
]

interface Props {
  open: boolean
  /** Pass an exercise to edit it; omit to create a new custom exercise. */
  exercise?: Exercise | null
  onClose: () => void
  onSaved?: (id: string) => void
}

export function ExerciseFormSheet({ open, exercise, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>('Chest')
  const [equipment, setEquipment] = useState<Equipment>('Barbell')
  const [kind, setKind] = useState<ExerciseKind>('weight_reps')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Reset the form each time the sheet opens so stale input never leaks in.
  useEffect(() => {
    if (!open) return
    setName(exercise?.name ?? '')
    setMuscleGroup(exercise?.muscleGroup ?? 'Chest')
    setEquipment(exercise?.equipment ?? 'Barbell')
    setKind(exercise?.kind ?? 'weight_reps')
    setNotes(exercise?.notes ?? '')
    setError(null)
  }, [open, exercise])

  async function save() {
    const trimmed = name.trim()
    if (trimmed === '') {
      setError('Give the exercise a name.')
      return
    }
    const clash = await db.exercises
      .filter((e) => e.id !== exercise?.id && e.name.toLowerCase() === trimmed.toLowerCase())
      .first()
    if (clash) {
      setError('An exercise with that name already exists.')
      return
    }

    const record: Exercise = {
      id: exercise?.id ?? newId(),
      name: trimmed,
      muscleGroup,
      secondaryMuscles: exercise?.secondaryMuscles,
      equipment,
      kind,
      isCustom: exercise?.isCustom ?? true,
      notes: notes.trim() || undefined,
      archived: exercise?.archived,
      createdAt: exercise?.createdAt ?? Date.now(),
    }
    await db.exercises.put(record)
    onSaved?.(record.id)
    onClose()
  }

  return (
    <Sheet
      open={open}
      title={exercise ? 'Edit exercise' : 'New exercise'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost grow" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary grow" onClick={() => void save()}>
            Save
          </button>
        </>
      }
    >
      <div className="list" style={{ gap: 14 }}>
        <div className="field">
          <label className="field-label" htmlFor="ex-name">
            Name
          </label>
          <input
            id="ex-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Reverse Grip Pulldown"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ex-muscle">
            Primary muscle
          </label>
          <select
            id="ex-muscle"
            className="input"
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}
          >
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ex-equip">
            Equipment
          </label>
          <select
            id="ex-equip"
            className="input"
            value={equipment}
            onChange={(e) => setEquipment(e.target.value as Equipment)}
          >
            {EQUIPMENT.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ex-kind">
            What gets logged
          </label>
          <select
            id="ex-kind"
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ExerciseKind)}
          >
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <span className="faint">Controls which columns appear when you log this exercise.</span>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="ex-notes">
            Notes (optional)
          </label>
          <textarea
            id="ex-notes"
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Seat height, grip, cues…"
          />
        </div>

        {error && <p style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>{error}</p>}
      </div>
    </Sheet>
  )
}
