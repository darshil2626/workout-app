import { useMemo } from 'react'
import type { Exercise, Folder, Routine } from '../../db/types'
import { IconFolder, IconPlay, IconTrash } from '../Icons'
import { formatRelative } from '../../lib/time'
import { useSwipeToDelete } from '../../lib/useSwipeToDelete'

interface Props {
  routines: Routine[]
  folders: Folder[]
  exerciseById: Map<string, Exercise>
  onStart: (routine: Routine) => void
  onMenu: (routine: Routine) => void
  /** Swipe's faster path onto the same delete this menu's "Delete routine"
   *  option already reaches — no dedicated "..." trigger sits on this card
   *  (the whole info area already opens the menu on a single tap), so this
   *  list only picks up swipe-to-delete, not long-press. */
  onSwipeDelete: (routine: Routine) => void
  onNewRoutine: () => void
  onNewFolder: () => void
}

/**
 * The old home screen, demoted to a section. Grouping, ordering, the card and
 * its context menu are unchanged — this is still the list people navigate by
 * once they have decided what to train.
 */
export function RoutinesSection({
  routines,
  folders,
  exerciseById,
  onStart,
  onMenu,
  onSwipeDelete,
  onNewRoutine,
  onNewFolder,
}: Props) {
  const routineById = useMemo(() => new Map(routines.map((r) => [r.id, r])), [routines])
  const swipe = useSwipeToDelete((id) => {
    const r = routineById.get(id)
    if (r) onSwipeDelete(r)
  })
  const sortedFolders = useMemo(() => [...folders].sort((a, b) => a.order - b.order), [folders])
  const byFolder = useMemo(() => {
    const map = new Map<string | null, Routine[]>()
    for (const r of [...routines].sort((a, b) => a.order - b.order || b.updatedAt - a.updatedAt)) {
      const key = r.folderId
      map.set(key, [...(map.get(key) ?? []), r])
    }
    return map
  }, [routines])

  function summary(routine: Routine): string {
    if (routine.exercises.length === 0) return 'No exercises yet'
    return routine.exercises
      .map((re) => {
        const name = exerciseById.get(re.exerciseId)?.name ?? 'Unknown'
        return `${re.sets.length} × ${name}`
      })
      .join(', ')
  }

  const loose = byFolder.get(null) ?? []

  return (
    <section>
      <div className="row-between home-section-row">
        <span className="section-title">Your routines</span>
        <span className="row home-section-actions">
          <button className="header-action home-section-muted" onClick={onNewFolder}>
            New folder
          </button>
          <button className="header-action" onClick={onNewRoutine}>
            New routine
          </button>
        </span>
      </div>

      {routines.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📋</div>
          <h3>No routines yet</h3>
          <p className="muted">
            Build a routine once and every session starts pre-filled with your exercises and target
            sets.
          </p>
        </div>
      )}

      {sortedFolders.map((folder) => (
        <div key={folder.id}>
          <div className="section-title row" style={{ gap: 8 }}>
            <IconFolder />
            {folder.name}
          </div>
          {(byFolder.get(folder.id) ?? []).length === 0 ? (
            <p className="faint" style={{ paddingLeft: 4 }}>
              Empty folder
            </p>
          ) : (
            <div className="list">
              {(byFolder.get(folder.id) ?? []).map((r) => (
                <RoutineCard
                  key={r.id}
                  routine={r}
                  summary={summary(r)}
                  onStart={() => onStart(r)}
                  onMenu={() => onMenu(r)}
                  swipe={swipe}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {loose.length > 0 && (
        <>
          {sortedFolders.length > 0 && <div className="section-title">Other routines</div>}
          <div className="list" style={sortedFolders.length > 0 ? undefined : { marginTop: 2 }}>
            {loose.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                summary={summary(r)}
                onStart={() => onStart(r)}
                onMenu={() => onMenu(r)}
                swipe={swipe}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function RoutineCard({
  routine,
  summary,
  onStart,
  onMenu,
  swipe,
}: {
  routine: Routine
  summary: string
  onStart: () => void
  onMenu: () => void
  swipe: ReturnType<typeof useSwipeToDelete>
}) {
  const swipeRow = swipe.rowProps(routine.id)
  return (
    <div className="swipe-row">
      <div className="swipe-row-action">
        <IconTrash />
        Delete
      </div>
      <div className="card swipe-row-content" style={swipeRow.style} onPointerDown={swipeRow.onPointerDown}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <button className="stack grow" style={{ textAlign: 'left' }} onClick={onMenu}>
            <span style={{ fontWeight: 650 }}>{routine.name}</span>
            <span className="faint" style={{ lineHeight: 1.4 }}>
              {summary}
            </span>
            {routine.lastPerformedAt ? (
              <span className="faint">Last done {formatRelative(routine.lastPerformedAt)}</span>
            ) : null}
          </button>
        </div>
        <button
          className="btn btn-primary btn-sm btn-block"
          style={{ marginTop: 10 }}
          onClick={onStart}
        >
          <IconPlay />
          Start routine
        </button>
      </div>
    </div>
  )
}
