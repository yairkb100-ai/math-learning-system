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

// Brand mark — a little chalkboard with a chalk-drawn pair of compasses.
// Uses palette CSS vars so it re-tints with the theme; not stroke=currentColor.
export function IconBrand({ size = 30, ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      {...rest}
    >
      {/* board */}
      <rect
        x="1.5"
        y="1.5"
        width="29"
        height="29"
        rx="8"
        fill="var(--board, #294a41)"
        stroke="var(--board-edge, #1e3a33)"
        strokeWidth="1.5"
      />
      {/* chalk compasses */}
      <g
        fill="none"
        stroke="var(--chalk, #f4f2e9)"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="16" cy="8" r="1.7" />
        <path d="M16 9.6 11 22" />
        <path d="M16 9.6 20.4 19" />
        <path d="M11 22a9 9 0 0 0 10-2.2" strokeDasharray="1.4 3.2" strokeWidth="1.3" />
      </g>
      {/* accent pencil-tip on the drawing leg */}
      <path d="M20.4 19l1.4 3" stroke="var(--marker, #f2b134)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function IconPlay(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 6 3.5-6 3.5v-7Z" />
    </svg>
  )
}

export function IconBook(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 6.5C10.5 5 8 4.6 4 5.2V18c4-.6 6.5-.2 8 1.3 1.5-1.5 4-1.9 8-1.3V5.2c-4-.6-6.5-.2-8 1.3Z" />
      <path d="M12 6.5v12.8" />
    </svg>
  )
}

export function IconBulb(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9.5 18h5" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.2 1.3 2.4h5c.2-1.2.6-1.8 1.3-2.4A6 6 0 0 0 12 3Z" />
    </svg>
  )
}

export function IconPencil(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12.5 20H21" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  )
}

export function IconTarget(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconTrophy(props) {
  return (
    <svg {...base} {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5v1a3 3 0 0 0 3 3" />
      <path d="M16 6h3v1a3 3 0 0 1-3 3" />
      <path d="M10 15.5h4" />
      <path d="M9 20h6" />
      <path d="M12 15.5V20" />
    </svg>
  )
}

export function IconCheck(props) {
  return (
    <svg {...base} {...props}>
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}

export function IconDownload(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3v12" />
      <path d="m7 11 5 4 5-4" />
      <path d="M5 20h14" />
    </svg>
  )
}

export function IconUpload(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 20V8" />
      <path d="m7 12 5-4 5 4" />
      <path d="M5 4h14" />
    </svg>
  )
}

export function IconPaperclip(props) {
  return (
    <svg {...base} {...props}>
      <path d="M20 11.5 11.5 20a5 5 0 0 1-7-7l9-9a3.3 3.3 0 0 1 4.7 4.7l-9 9a1.6 1.6 0 0 1-2.3-2.3l8-8" />
    </svg>
  )
}

export function IconFile(props) {
  return (
    <svg {...base} {...props}>
      <path d="M13 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V9l-6-6Z" />
      <path d="M13 3v6h6" />
    </svg>
  )
}

export function IconLines(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 6.5h14" />
      <path d="M5 12h14" />
      <path d="M5 17.5h9" />
    </svg>
  )
}

export function IconWarning(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 4 2.6 20h18.8L12 4Z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
