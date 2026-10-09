import { useState } from 'react'
import { buildDebugInfo, copyText } from '../lib/debugReport'

/**
 * Puts a report of versions, counts and recent failure names on the clipboard,
 * to paste into a bug report. Contains nothing from inside a workout.
 */
export function CopyDebugInfo({ className = 'btn btn-ghost' }: { className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    const ok = await copyText(await buildDebugInfo())
    setState(ok ? 'copied' : 'failed')
  }

  return (
    <>
      <button className={className} onClick={() => void copy()}>
        Copy debug info
      </button>
      {state !== 'idle' && (
        <p className="faint" role="status">
          {state === 'copied'
            ? 'Copied. Paste it into your message. It holds versions and counts, nothing from your workouts.'
            : 'Could not copy automatically. Please describe what you saw instead.'}
        </p>
      )}
    </>
  )
}
