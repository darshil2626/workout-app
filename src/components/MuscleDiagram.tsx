import type { MuscleGroup } from '../db/types'

/** Simplified body regions the diagram can color — several MuscleGroups map to one. */
type Region =
  | 'neck'
  | 'traps'
  | 'shoulders'
  | 'chest'
  | 'back'
  | 'abs'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'

const ALL_REGIONS: Region[] = [
  'neck',
  'traps',
  'shoulders',
  'chest',
  'back',
  'abs',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
]

const MUSCLE_TO_REGIONS: Record<MuscleGroup, Region[]> = {
  Chest: ['chest'],
  Back: ['back'],
  Shoulders: ['shoulders'],
  Biceps: ['biceps'],
  Triceps: ['triceps'],
  Forearms: ['forearms'],
  Quadriceps: ['quadriceps'],
  Hamstrings: ['hamstrings'],
  Glutes: ['glutes'],
  Calves: ['calves'],
  Abs: ['abs'],
  Traps: ['traps'],
  Neck: ['neck'],
  'Full Body': ALL_REGIONS,
  Cardio: [],
  Other: [],
}

function regionsFor(groups: MuscleGroup[]): Set<Region> {
  const out = new Set<Region>()
  for (const g of groups) for (const r of MUSCLE_TO_REGIONS[g]) out.add(r)
  return out
}

type Part = { region: Region; shape: React.ReactNode }

/** Left-half shape mirrored onto the right half, so muscle coordinates are only written once. */
function paired(region: Region, shape: React.ReactNode): Part[] {
  return [
    { region, shape },
    { region, shape: <g transform="translate(100,0) scale(-1,1)">{shape}</g> },
  ]
}

/**
 * Radial gradients (lighter upper-left → darker lower-right, per shape's own
 * bounding box) so each muscle reads as a rounded volume rather than a flat
 * color chip. Colors are hand-derived from the app's --accent/--accent-dim/
 * --surface-2 — safe to hardcode since this app has no light theme to break.
 */
function MuscleGradientDefs({ idPrefix }: { idPrefix: string }) {
  const ramps: [string, string, string, string][] = [
    [`${idPrefix}-primary`, '#82b0ff', '#4f8cff', '#3568c9'],
    [`${idPrefix}-secondary`, '#5c7dbd', '#2f4f8f', '#20386a'],
    [`${idPrefix}-neutral`, '#282e3a', '#1b1f29', '#131620'],
  ]
  return (
    <defs>
      {ramps.map(([id, light, mid, dark]) => (
        <radialGradient key={id} id={id} cx="32%" cy="28%" r="80%">
          <stop offset="0%" stopColor={light} />
          <stop offset="55%" stopColor={mid} />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
      ))}
      <filter id={`${idPrefix}-shadow`} x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="0.6" stdDeviation="0.6" floodColor="#000" floodOpacity="0.35" />
      </filter>
    </defs>
  )
}

interface FigureProps {
  title: string
  parts: Part[]
  fillFor: (region: Region, idPrefix: string) => string
}

/** One body outline (front or back) built from labelled, individually-colorable muscle shapes. */
function Figure({ title, parts, fillFor }: FigureProps) {
  const idPrefix = title.toLowerCase()
  return (
    <div className="stack" style={{ alignItems: 'center', gap: 4 }}>
      <svg viewBox="0 0 100 220" width="100%" style={{ maxWidth: 130 }}>
        <MuscleGradientDefs idPrefix={idPrefix} />
        <g stroke="var(--border-strong)" strokeWidth="0.6" strokeLinejoin="round" filter={`url(#${idPrefix}-shadow)`}>
          <circle cx={50} cy={13} r={11} fill={`url(#${idPrefix}-neutral)`} />
          {parts.map(({ region, shape }, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <g key={i} fill={fillFor(region, idPrefix)}>
              {shape}
            </g>
          ))}
        </g>
      </svg>
      <span className="faint">{title}</span>
    </div>
  )
}

// All left-half shapes are drawn relative to the centerline (x=50) and mirrored
// via paired() for the right half — see that helper for how.

const frontParts: Part[] = [
  { region: 'neck', shape: <path d="M 44 21 L 56 21 L 55 30 L 45 30 Z" /> },

  // Deltoid cap.
  ...paired('shoulders', <ellipse cx={23} cy={38} rx={8} ry={9.5} transform="rotate(-18 23 38)" />),

  // Pec: one lobe per side, meeting at the sternum.
  ...paired(
    'chest',
    <path d="M 50 31 C 43 29 35 32 32 39 C 30 44 32 50 39 52 C 45 54 50 50 50 44 Z" />,
  ),

  // Six-pack: three blocks per side, mirrored to leave a visible centerline gap.
  ...paired('abs', <rect x={41.5} y={54} width={7} height={8} rx={2} />),
  ...paired('abs', <rect x={41.5} y={64} width={7} height={8} rx={2} />),
  ...paired('abs', <rect x={41.5} y={74} width={7} height={8} rx={2} />),

  ...paired('biceps', <ellipse cx={20} cy={57} rx={6.5} ry={17} transform="rotate(-6 20 57)" />),
  ...paired('forearms', <ellipse cx={18} cy={90} rx={5.5} ry={16} transform="rotate(-4 18 90)" />),

  // Quad: main sweep plus a small vastus-medialis bulge near the inner knee.
  ...paired('quadriceps', <ellipse cx={41} cy={112} rx={8} ry={22} transform="rotate(-3 41 112)" />),
  ...paired('quadriceps', <ellipse cx={46.5} cy={129} rx={3.5} ry={6} />),

  ...paired('calves', <ellipse cx={41} cy={157} rx={6} ry={16} />),
]

const backParts: Part[] = [
  { region: 'neck', shape: <path d="M 44 21 L 56 21 L 55 30 L 45 30 Z" /> },

  ...paired('shoulders', <ellipse cx={23} cy={38} rx={8} ry={9.5} transform="rotate(-18 23 38)" />),

  // Lats: wide at the armpit, tapering to a point at the lower back — must be
  // drawn before traps, which sits on top of it near the neck.
  ...paired(
    'back',
    <path d="M 50 33 C 41 33 32 39 30 49 C 29 57 33 65 41 68 C 46 69.5 50 66 50 60 Z" />,
  ),
  // Erector column, center — not mirrored, it already straddles the midline.
  { region: 'back', shape: <rect x={46} y={64} width={8} height={22} rx={3} /> },

  // Traps: the classic kite/diamond from neck to mid-back.
  { region: 'traps', shape: <path d="M 50 23 L 61 33 L 50 45 L 39 33 Z" /> },

  ...paired('triceps', <ellipse cx={20} cy={57} rx={6.5} ry={17} transform="rotate(-6 20 57)" />),
  ...paired('forearms', <ellipse cx={18} cy={90} rx={5.5} ry={16} transform="rotate(-4 18 90)" />),

  ...paired('glutes', <ellipse cx={41} cy={99} rx={10} ry={9.5} transform="rotate(-8 41 99)" />),
  ...paired('hamstrings', <ellipse cx={41} cy={123} rx={8} ry={18} />),

  // Calf: fuller, rounder bulge than the front-view lower leg.
  ...paired('calves', <ellipse cx={41} cy={155} rx={7} ry={17} />),
]

export function MuscleDiagram({
  primary,
  secondary,
}: {
  primary: MuscleGroup
  secondary?: MuscleGroup[]
}) {
  const primaryRegions = regionsFor([primary])
  const secondaryRegions = regionsFor(secondary ?? [])

  const fillFor = (region: Region, idPrefix: string): string => {
    if (primaryRegions.has(region)) return `url(#${idPrefix}-primary)`
    if (secondaryRegions.has(region)) return `url(#${idPrefix}-secondary)`
    return `url(#${idPrefix}-neutral)`
  }

  const hasAnyHighlight = primaryRegions.size > 0 || secondaryRegions.size > 0
  if (!hasAnyHighlight) return null

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="row" style={{ gap: 20, justifyContent: 'center' }}>
        <Figure title="Front" parts={frontParts} fillFor={fillFor} />
        <Figure title="Back" parts={backParts} fillFor={fillFor} />
      </div>
      <div className="row" style={{ gap: 16, justifyContent: 'center', marginTop: 10 }}>
        <span className="row" style={{ gap: 6, alignItems: 'center' }}>
          <span
            style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }}
          />
          <span className="faint">Primary</span>
        </span>
        {secondaryRegions.size > 0 && (
          <span className="row" style={{ gap: 6, alignItems: 'center' }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                background: 'var(--accent-dim)',
                display: 'inline-block',
              }}
            />
            <span className="faint">Secondary</span>
          </span>
        )}
      </div>
    </div>
  )
}
