import { Sheet } from '../Sheet'
import { TEMPLATES, type Template } from '../../lib/templates'

interface Props {
  open: boolean
  onPick: (template: Template) => void
  onClose: () => void
}

/** The starter routines offered to someone new to lifting. Picking one saves it and starts it. */
export function TemplateSheet({ open, onPick, onClose }: Props) {
  return (
    <Sheet open={open} title="Pick a starter routine" onClose={onClose}>
      <p className="faint" style={{ marginBottom: 8 }}>
        Not medical advice; these are common starting points.
      </p>
      {TEMPLATES.map((t) => (
        <button key={t.id} className="sheet-list-item" onClick={() => onPick(t)}>
          <span className="stack grow">
            <span style={{ fontWeight: 600 }}>{t.name}</span>
            <span className="muted">{t.description}</span>
            <span className="faint">
              {t.daysPerWeek} days a week · {t.equipment}
            </span>
          </span>
        </button>
      ))}
    </Sheet>
  )
}
