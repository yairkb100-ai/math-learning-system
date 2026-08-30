// Mechanical-reasoning renderer for the קרני area (הפרק "כושר מכני").
//
// Same idea as FigureArt.jsx / SpatialArt.jsx beside it: a question is a line
// of JSON, and the SAME code draws the diagram in the stem and (when needed)
// in the options, so a distractor can never look subtly wrong for the wrong
// reason. The physics each token encodes is decidable from the token text
// alone — torque from (weight × distance), gear direction from the count of
// meshes, load share from which shoulder is closer — so a QA pass checks the
// key with arithmetic, not with a ruler.
//
// SEPARATORS — the house convention shared with FigureArt/SpatialArt and the
// MathText token grammar: "," between attributes of one element, ";" between
// elements. Never "|" or "}" inside a param ("|" only starts the caption).
//
// Tokens:
//
//   {{lever:fulcrum=<slot>; w<weight>@<slot>; w<weight>@<slot>; … [; tilt=left|right|level]}}
//     A rigid beam over 7 numbered slots (1 = far left … 7 = far right). The
//     fulcrum triangle sits under <slot>. Each "w3@2" hangs a load of 3 units
//     under slot 2. Net torque = Σ weight×(slot − fulcrum): negative → left
//     side down. "tilt=" forces the drawn state (for an option that shows a
//     result); omitted, the beam is drawn level and the question asks.
//
//   {{gears:<teeth>[,cw|ccw]; <teeth>; <teeth>; …}}
//     A left-to-right chain of meshed gears. Radius ∝ teeth. The first gear
//     carries the drive arrow (cw = clockwise, default). Meshed gears turn
//     opposite ways, so gear k turns like gear 1 iff k is odd; turning speed
//     is inversely proportional to the teeth count.
//
//   {{pole:load=<slot>}}
//     Two people carry a horizontal pole on their shoulders (left person at
//     slot 1, right person at slot 7); a load hangs at <slot>. The closer
//     person bears more — share is linear in the distance to each shoulder.
//
// RTL: every token lays elements out left→right by slot number and is drawn
// inside dir="ltr" by FractionArt's wrapper, so "slot 1" is always the
// left-most one regardless of page direction.

import { INK, ACCENT, WARM } from './FigureArt.jsx'

const SLOTS = 7

// slot 1..7  ->  x in the drawing
const slotX = (slot, x0, span) => x0 + ((slot - 1) / (SLOTS - 1)) * span

// ---------------------------------------------------------------------------
// {{lever:...}}
// ---------------------------------------------------------------------------

function parseLever(body) {
  let fulcrum = 4
  let tilt = null
  const weights = []
  for (const raw of String(body).split(';')) {
    const part = raw.trim()
    if (!part) continue
    const f = part.match(/^fulcrum\s*=\s*(\d)$/)
    if (f) { fulcrum = Number(f[1]); continue }
    const t = part.match(/^tilt\s*=\s*(left|right|level)$/)
    if (t) { tilt = t[1]; continue }
    const w = part.match(/^w\s*(\d+(?:\.\d+)?)\s*@\s*(\d)$/)
    if (w) weights.push({ weight: Number(w[1]), slot: Number(w[2]) })
  }
  return { fulcrum, tilt, weights }
}

function leverAngle({ fulcrum, tilt, weights }) {
  if (tilt === 'left') return 9
  if (tilt === 'right') return -9
  if (tilt === 'level') return 0
  const torque = weights.reduce((s, w) => s + w.weight * (w.slot - fulcrum), 0)
  if (torque > 0) return -9
  if (torque < 0) return 9
  return 0
}

function Lever({ param }) {
  const spec = parseLever(param)
  const W = 320, H = 150
  const x0 = 24, span = W - 48
  const pivotX = slotX(spec.fulcrum, x0, span)
  const beamY = 62
  const angle = leverAngle(spec)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="art-svg" role="img">
      {/* ground + fulcrum */}
      <line x1="16" y1={H - 20} x2={W - 16} y2={H - 20} stroke={INK} strokeWidth="2" />
      <polygon
        points={`${pivotX},${beamY + 4} ${pivotX - 18},${H - 20} ${pivotX + 18},${H - 20}`}
        fill={ACCENT} stroke={INK} strokeWidth="2"
      />
      <g transform={`rotate(${angle} ${pivotX} ${beamY})`}>
        <rect x={x0} y={beamY - 6} width={span} height="12" rx="3"
          fill="var(--surface, #fff)" stroke={INK} strokeWidth="2.5" />
        {Array.from({ length: SLOTS }, (_, i) => i + 1).map((s) => (
          <circle key={s} cx={slotX(s, x0, span)} cy={beamY} r="2" fill={INK} />
        ))}
        {spec.weights.map((w, i) => {
          const wx = slotX(w.slot, x0, span)
          const side = w.weight >= 3 ? 22 : 16
          return (
            <g key={i}>
              <line x1={wx} y1={beamY + 6} x2={wx} y2={beamY + 16} stroke={INK} strokeWidth="1.5" />
              <rect x={wx - side / 2} y={beamY + 16} width={side} height={side} rx="2"
                fill={WARM} stroke={INK} strokeWidth="2" />
              <text x={wx} y={beamY + 16 + side / 2 + 4} textAnchor="middle"
                fontSize="11" fontWeight="700" fill={INK}>{w.weight}</text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// {{gears:...}}
// ---------------------------------------------------------------------------

function parseGears(body) {
  const gears = []
  let drive = 'cw'
  String(body).split(';').forEach((raw, i) => {
    const part = raw.trim()
    if (!part) return
    const m = part.match(/^(\d+)\s*(?:,\s*(cw|ccw))?$/)
    if (!m) return
    if (i === 0 && m[2]) drive = m[2]
    gears.push({ teeth: Number(m[1]) })
  })
  return { gears, drive }
}

function GearShape({ cx, cy, r, teeth, label, arrow }) {
  const inner = r * 0.78
  const spokes = []
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2
    spokes.push(
      <line key={k}
        x1={cx + Math.cos(a) * inner} y1={cy + Math.sin(a) * inner}
        x2={cx + Math.cos(a) * (r + 3)} y2={cy + Math.sin(a) * (r + 3)}
        stroke={INK} strokeWidth="2" />
    )
  }
  return (
    <g>
      {spokes}
      <circle cx={cx} cy={cy} r={inner} fill="var(--surface, #fff)" stroke={INK} strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r={r * 0.14} fill={INK} />
      {label != null && (
        <text x={cx} y={cy - r - 10} textAnchor="middle" fontSize="13" fontWeight="700" fill={ACCENT}>
          {label}
        </text>
      )}
      {arrow && (
        <path
          d={arrow === 'cw'
            ? `M ${cx - inner * 0.62} ${cy} A ${inner * 0.62} ${inner * 0.62} 0 1 1 ${cx + inner * 0.44} ${cy + inner * 0.44}`
            : `M ${cx + inner * 0.62} ${cy} A ${inner * 0.62} ${inner * 0.62} 0 1 0 ${cx - inner * 0.44} ${cy + inner * 0.44}`}
          fill="none" stroke={WARM} strokeWidth="4" strokeLinecap="round" markerEnd="url(#gear-arrow)" />
      )}
    </g>
  )
}

function Gears({ param }) {
  const { gears, drive } = parseGears(param)
  if (!gears.length) return null
  const maxT = Math.max(...gears.map((g) => g.teeth))
  const R = gears.map((g) => 28 + 34 * (g.teeth / maxT))
  const H = 190
  let cx = 30 + R[0]
  const centers = []
  gears.forEach((g, i) => {
    if (i > 0) cx += R[i - 1] + R[i] - 6
    centers.push(cx)
  })
  const W = cx + R[R.length - 1] + 30
  const cy = H / 2 + 6

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="art-svg" role="img">
      <defs>
        <marker id="gear-arrow" markerWidth="7" markerHeight="7" refX="4" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill={WARM} />
        </marker>
      </defs>
      {gears.map((g, i) => (
        <GearShape key={i} cx={centers[i]} cy={cy} r={R[i]} teeth={g.teeth}
          label={g.teeth}
          arrow={i === 0 ? drive : null} />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// {{pole:load=<slot>}}
// ---------------------------------------------------------------------------

function Person({ x, shoulderY }) {
  const feet = shoulderY + 78
  return (
    <g stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round">
      <circle cx={x} cy={shoulderY - 20} r="11" fill="var(--surface, #fff)" />
      <line x1={x} y1={shoulderY - 9} x2={x} y2={feet - 26} />
      <line x1={x} y1={feet - 26} x2={x - 12} y2={feet} />
      <line x1={x} y1={feet - 26} x2={x + 12} y2={feet} />
      <line x1={x} y1={shoulderY} x2={x - 14} y2={shoulderY - 6} />
      <line x1={x} y1={shoulderY} x2={x + 14} y2={shoulderY - 6} />
    </g>
  )
}

function Pole({ param }) {
  const m = String(param).match(/load\s*=\s*(\d)/)
  const load = m ? Number(m[1]) : 4
  const W = 340, H = 180
  const x0 = 40, span = W - 80
  const shoulderY = 46
  const lx = slotX(1, x0, span)
  const rx = slotX(7, x0, span)
  const wx = slotX(load, x0, span)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="art-svg" role="img">
      <line x1="14" y1={H - 14} x2={W - 14} y2={H - 14} stroke={INK} strokeWidth="2" />
      <Person x={lx} shoulderY={shoulderY} />
      <Person x={rx} shoulderY={shoulderY} />
      <rect x={lx} y={shoulderY - 6} width={rx - lx} height="9" rx="3"
        fill="var(--surface, #fff)" stroke={INK} strokeWidth="2.5" />
      <line x1={wx} y1={shoulderY + 3} x2={wx} y2={shoulderY + 22} stroke={INK} strokeWidth="2" />
      <rect x={wx - 18} y={shoulderY + 22} width="36" height="32" rx="3"
        fill={WARM} stroke={INK} strokeWidth="2.5" />
      {[1, 7].map((s) => (
        <circle key={s} cx={slotX(s, x0, span)} cy={shoulderY - 1} r="3" fill={ACCENT} />
      ))}
    </svg>
  )
}

// ---------------------------------------------------------------------------

export function renderMechanicalToken(name, param) {
  switch (name) {
    case 'lever': return <Lever param={param} />
    case 'gears': return <Gears param={param} />
    case 'pole': return <Pole param={param} />
    default: return null
  }
}

// Registered into FractionArt's KINDS map next to FIGURE_KINDS / SPATIAL_KINDS,
// so MathText routes lever/gears/pole like any other illustration token.
export const MECHANICAL_KINDS = {
  lever: ({ param }) => renderMechanicalToken('lever', param),
  gears: ({ param }) => renderMechanicalToken('gears', param),
  pole: ({ param }) => renderMechanicalToken('pole', param),
}
