// Lightweight inline-SVG icon set — stroke-based, inherits `currentColor` and
// font size (1em). Replaces decorative emoji with a consistent, non-"AI" look.
// Add props like className/style as needed; all forward ...rest to <svg>.

const base = {
  width: '1em',
  height: '1em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

export function IconLayers(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
      <path d="m3 18 9 5 9-5" opacity="0.55" />
    </svg>
  )
}

export function IconClock(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function IconArrowStart(props) {
  // Points to the start of the line (left in RTL) — for "continue" CTAs.
  return (
    <svg {...base} {...props}>
      <path d="M19 12H5" />
      <path d="m11 6-6 6 6 6" />
    </svg>
  )
}

export function IconGraduation(props) {
  return (
    <svg {...base} {...props}>
      <path d="M22 9 12 5 2 9l10 4 10-4Z" />
      <path d="M6 10.5V15c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5v-4.5" />
      <path d="M22 9v5" />
    </svg>
  )
}

export function IconSpark(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4" opacity="0.7" />
      <path d="M12 8.5 13.4 11l2.6 1-2.6 1L12 15.5 10.6 13 8 12l2.6-1L12 8.5Z" />
    </svg>
  )
}

export function IconCompass(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" />
    </svg>
  )
}
