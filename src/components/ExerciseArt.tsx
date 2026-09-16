import { useEffect, useState } from 'react'
import { EXERCISE_ART } from '../db/exerciseArt'

const FRAME_MS = 750

/** Out and back, so the movement reads as a rep rather than snapping from end to start. */
const SEQUENCE = [0, 1, 2, 1]

/**
 * Loops the three drawn frames of an exercise. Renders nothing for exercises
 * without a drawing — custom ones, and the handful of seed movements the
 * illustration set doesn't cover — rather than showing a placeholder.
 */
export function ExerciseArt({ exerciseId }: { exerciseId: string }) {
  const slug = EXERCISE_ART[exerciseId]
  const [step, setStep] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setStep(0)
    setFailed(false)
  }, [exerciseId])

  useEffect(() => {
    if (!slug || failed) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const id = setInterval(() => setStep((s) => (s + 1) % SEQUENCE.length), FRAME_MS)
    return () => clearInterval(id)
  }, [slug, failed])

  if (!slug || failed) return null

  // BASE_URL, not a leading slash: the Pages build serves the app from /<repo>/.
  const src = (frame: number) => `${import.meta.env.BASE_URL}exercise-art/${slug}/frame-${frame}.svg`
  const current = SEQUENCE[step]

  return (
    <div className="card" style={{ marginTop: 12 }}>
      {/* All three frames are mounted and cross-faded by opacity so every one is
          decoded before it is needed — swapping a single src flickers on the
          first cycle. */}
      <div style={{ position: 'relative', height: 200 }}>
        {[1, 2, 3].map((frame, i) => (
          <img
            key={frame}
            src={src(frame)}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              opacity: i === current ? 1 : 0,
            }}
          />
        ))}
      </div>
      <p className="faint" style={{ margin: '8px 0 0', textAlign: 'center' }}>
        Illustration · Workout Guide / Everkinetic (CC BY-SA 4.0)
      </p>
    </div>
  )
}
