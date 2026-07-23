// Scattered "chalk on the blackboard" math doodles — a decorative backdrop for
// hero panels. Pure line-art (stroke: currentColor), so the parent sets the
// colour (chalk-white on the board) and opacity. aria-hidden: purely atmospheric.
//
// Objects: a ruler, a pair of compasses, a pencil, an open book, a protractor,
// a set-square, plus loose symbols (π, √, ∑, ∞) and a little function curve.

export default function MathDoodles({ className, ...rest }) {
  return (
    <svg
      className={className}
      viewBox="0 0 900 420"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      {...rest}
    >
      {/* ruler (top-left) */}
      <g transform="translate(40 46) rotate(-12)">
        <rect x="0" y="0" width="150" height="34" rx="4" />
        <path d="M20 0v12M40 0v18M60 0v12M80 0v18M100 0v12M120 0v18M140 0v12" />
      </g>

      {/* pair of compasses (top area, right of centre) */}
      <g transform="translate(470 34)">
        <circle cx="30" cy="6" r="5" />
        <path d="M30 11 15 96" />
        <path d="M30 11 47 74" />
        <path d="M47 74l7 14" />
        <path d="M15 96l-4 12" />
        <path d="M12 104a40 40 0 0 0 44-8" strokeDasharray="3 8" />
      </g>

      {/* pencil (right side, diagonal) */}
      <g transform="translate(742 70) rotate(38)">
        <path d="M0 0h96v22H0z" />
        <path d="M96 0l26 11-26 11z" />
        <path d="M112 6l6 5-6 5" />
        <path d="M0 0v22" />
      </g>

      {/* open book (bottom-left) */}
      <g transform="translate(70 250)">
        <path d="M0 12C24 0 60 0 84 12v78C60 78 24 78 0 90z" />
        <path d="M84 12c24-12 60-12 84 0v78c-24-12-60-12-84 0z" />
        <path d="M84 12v78" />
        <path d="M14 30c16-6 40-6 56 0M14 48c16-6 40-6 56 0M98 30c16-6 40-6 56 0M98 48c16-6 40-6 56 0" strokeWidth="1.6" />
      </g>

      {/* protractor (bottom, centre-right) */}
      <g transform="translate(470 300)">
        <path d="M0 60a90 90 0 0 1 180 0z" />
        <path d="M22 60a68 68 0 0 1 136 0" strokeDasharray="2 9" strokeWidth="1.6" />
        <circle cx="90" cy="60" r="3.5" />
      </g>

      {/* set-square / triangle (right, low) */}
      <g transform="translate(720 280)">
        <path d="M0 0h120L0 108z" />
        <path d="M0 78a30 30 0 0 0 22-22" strokeWidth="1.6" />
      </g>

      {/* loose symbols */}
      <g strokeWidth="3" fontFamily="Georgia, serif">
        {/* √ radical with a bar */}
        <path d="M250 120l10 26 16-58h70" />
        {/* function curve on tiny axes */}
        <g transform="translate(250 250)">
          <path d="M0 60V0M0 60h80" strokeWidth="1.8" />
          <path d="M2 54C22 54 30 6 64 6" />
        </g>
      </g>

      {/* π, ∑, ∞ as glyphs (serif chalk) */}
      <g fill="currentColor" stroke="none" fontFamily="Georgia, serif" fontStyle="italic">
        <text x="356" y="196" fontSize="52">π</text>
        <text x="612" y="196" fontSize="54">∑</text>
        <text x="150" y="196" fontSize="40">∞</text>
        <text x="828" y="392" fontSize="44">÷</text>
      </g>
    </svg>
  )
}
