import { IconTriangleDown, IconTriangleUp } from './Icons'

/**
 * A small up/down indicator comparing a live number against a fixed
 * comparison point — a set's weight against last session's same set, or a
 * session's running total against the last time this workout was done.
 *
 * Colour follows the same rule the home screen's strength trend already
 * uses (see `.home-trend-delta` in src/styles): an increase gets the gold
 * "reward" hue, and a decrease stays a neutral dim tone rather than
 * `--danger` — a lighter set is a deload or an off day, not a failure, so it
 * never reads as an error state. `text` carries the number so the colour is
 * never the only thing telling them apart.
 */
export function DeltaBadge({
  up,
  text,
  label,
  className,
}: {
  up: boolean
  text: string
  label: string
  /** Extra class for placement tweaks at a given call site (e.g. inline with
   *  a stat tile's headline number instead of stacked under it). */
  className?: string
}) {
  return (
    // role="img" is what lets aria-label apply: on a plain span it is prohibited and
    // ignored, which left a screen reader nothing to say (the visible text is hidden).
    <span
      className={`delta-badge${up ? ' up' : ' down'}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={label}
    >
      {up ? <IconTriangleUp /> : <IconTriangleDown />}
      <span aria-hidden="true">{text}</span>
    </span>
  )
}
