import type { CSSProperties } from 'react'

interface SkeletonProps {
  /** Any valid CSS size, e.g. '100%', 120, '2.5rem'. */
  width?: string | number
  height?: string | number
  radius?: string | number
  className?: string
  style?: CSSProperties
}

/**
 * A static, layout-shaped placeholder block for anything that realistically
 * takes near/over a second to load — a lazy route chunk on a slow connection,
 * or a page's first Dexie query. Unlike `.spinner`, which just says "wait",
 * a skeleton roughly draws the shape of what's coming, so the page reads as
 * "already loading the real thing" rather than flashing a generic loader.
 *
 * Pure CSS pulse (`.skeleton` in index.css); the app-wide reduced-motion
 * media query already zeroes every animation's duration, so this needs no
 * extra handling to respect it.
 */
export function Skeleton({ width = '100%', height = 16, radius = 8, className, style }: SkeletonProps) {
  return (
    <div
      className={`skeleton${className ? ` ${className}` : ''}`}
      style={{ width, height, borderRadius: radius, ...style }}
      aria-hidden="true"
    />
  )
}

/**
 * Suspense fallback for a lazy route chunk. Rendered before the real page
 * (and its own Header) has even arrived over the network, so it draws its
 * own header-shaped bar rather than assuming any particular page's layout —
 * a rough approximation beats a spinner for the slow-connection case this
 * covers, without pretending to know what's underneath.
 */
export function PageSkeleton() {
  return (
    <>
      <div className="header">
        <div className="header-row">
          <Skeleton width={110} height={20} />
        </div>
      </div>
      <div className="page">
        <Skeleton height={52} radius={12} style={{ marginBottom: 16 }} />
        <Skeleton height={88} radius={14} style={{ marginBottom: 12 }} />
        <Skeleton height={88} radius={14} style={{ marginBottom: 12 }} />
        <Skeleton height={88} radius={14} />
      </div>
    </>
  )
}
