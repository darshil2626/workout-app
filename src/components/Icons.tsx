/**
 * Inline stroke icons. Kept local so the app ships no icon font and works
 * fully offline. All icons inherit `currentColor` and size from CSS.
 */
type Props = { className?: string }

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: '1em',
  height: '1em',
}

export const IconDumbbell = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M6.5 6.5v11M3.5 9v5M17.5 6.5v11M20.5 9v5M6.5 12h11" />
  </svg>
)

export const IconList = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
)

export const IconHistory = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M12 8v4l3 2" />
    <path d="M3.05 11a9 9 0 1 1 2.02 6.36" />
    <path d="M3 21v-5h5" />
  </svg>
)

export const IconChart = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M3 20h18M7 20V10M12 20V5M17 20v-7" />
  </svg>
)

export const IconPlus = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconCheck = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M4 12.5 9 17.5 20 6.5" />
  </svg>
)

export const IconClose = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const IconBack = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

export const IconSearch = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
)

export const IconMore = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </svg>
)

export const IconTrash = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
  </svg>
)

export const IconTimer = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 13V9M9 2h6" />
  </svg>
)

export const IconNote = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M5 3h11l4 4v14H5z" />
    <path d="M16 3v4h4M9 12h6M9 16h4" />
  </svg>
)

export const IconArrowUp = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
)

export const IconArrowDown = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
)

export const IconFolder = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)

export const IconSettings = ({ className }: Props) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
)

export const IconLink = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M9.5 14.5 14.5 9.5" />
    <path d="M8 11 6 13a3.5 3.5 0 0 0 5 5l2-2M16 13l2-2a3.5 3.5 0 0 0-5-5l-2 2" />
  </svg>
)

export const IconPlay = ({ className }: Props) => (
  <svg {...base} className={className}>
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
  </svg>
)
