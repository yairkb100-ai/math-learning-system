// Figural-reasoning renderer for the קרני area (הפרק הצורני).
//
// The figural section is the one part of the exam that cannot be written as
// text: matrices, shape series, figural analogies and odd-one-out all ARE the
// drawing. So items store a compact spec string and this renders it, which
// means an item stays a line of JSON instead of a hand-drawn asset — and the
// answer options are drawn by exactly the same code as the question, so a
// distractor can never look subtly different for the wrong reason.
//
// ---------------------------------------------------------------------------
// SEPARATORS. MathText's art-token regex treats "|" as the caption delimiter
// and stops a param at "}", so neither may appear inside a spec. Hence:
//   ","  between attributes of one cell
//   ";"  between cells of a row
//   "/"  between rows of a matrix (and between the two halves of a pair)
//
// Cell spec — comma-separated key=value pairs. Everything is optional.
//
//   shape  circle | square | triangle | diamond | star | hexagon | pentagon
//          | arrow | cross | heart | halfcircle | trapezoid   (default circle)
//   n      how many copies of the shape, 1–6 (default 1)
//   fill   none | solid | half | dots | stripes | grid        (default none)
//   rot    rotation in degrees                                (default 0)
//   size   s | m | l                                          (default m)
//   color  ink | accent | warm  — a *shape* attribute an item can key on
//   dot    tl | tr | bl | br | c — a small marker in a corner of the cell
//
// Example: "shape=triangle,n=2,fill=solid,rot=90"
//
// ---------------------------------------------------------------------------
// Tokens (used inside an item's stem / figure / options):
//
//   {{figcell:<spec>}}                     one cell — this is what options use
//   {{figrow:<spec>;<spec>;<spec>;?}}      a series; "?" renders the blank
//   {{figmatrix:<c>;<c>;<c>/<c>;…}}        a 3×3 matrix, "?" for the missing one
//   {{figpair:<A>;<B>/<C>;?}}              A is to B as C is to ?
//   {{figodd:<spec>;<spec>;<spec>;<spec>}} odd-one-out row, all cells drawn
//
// Rows read right-to-left, matching how a Hebrew-speaking student scans them.

const INK = '#1d3b34'
const ACCENT = '#1f7a8c'
const WARM = '#c98a1e'
const FILL_SOFT = '#dfeae4'

const COLORS = { ink: INK, accent: ACCENT, warm: WARM }
const SIZES = { s: 0.62, m: 0.82, l: 1.0 }

// ---------------------------------------------------------------------------
// spec parsing
// ---------------------------------------------------------------------------

export function parseCell(spec) {
  const out = {
    shape: 'circle',
    n: 1,
    fill: 'none',
    rot: 0,
    size: 'm',
    color: 'ink',
    dot: null,
    blank: false,
  }
  const raw = String(spec ?? '').trim()
  if (raw === '?' || raw === '') {
    out.blank = true
    return out
  }
  raw.split(',').forEach((pair) => {
    const [k, v] = pair.split('=').map((s) => (s || '').trim())
    if (!k || v === undefined) return
    if (k === 'n') out.n = Math.max(1, Math.min(6, parseInt(v, 10) || 1))
    else if (k === 'rot') out.rot = Number(v) || 0
    else if (k in out) out[k] = v
  })
  return out
}

// ---------------------------------------------------------------------------
// one shape, drawn centred on (0,0) in a unit box of ±r
// ---------------------------------------------------------------------------

function polygonPoints(sides, r, startAngle = -90) {
  const pts = []
  for (let i = 0; i < sides; i++) {
    const a = ((startAngle + (360 / sides) * i) * Math.PI) / 180
    pts.push([r * Math.cos(a), r * Math.sin(a)])
  }
  return pts.map((p) => p.map((v) => v.toFixed(2)).join(',')).join(' ')
}

function starPoints(r) {
  const pts = []
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = ((-90 + 36 * i) * Math.PI) / 180
    pts.push([(rad * Math.cos(a)).toFixed(2), (rad * Math.sin(a)).toFixed(2)])
  }
  return pts.map((p) => p.join(',')).join(' ')
}

function Shape({ kind, r, stroke, fillRef }) {
  const common = {
    fill: fillRef,
    stroke,
    strokeWidth: 2,
    strokeLinejoin: 'round',
  }
  switch (kind) {
    case 'square':
      return <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} {...common} />
    case 'triangle':
      return <polygon points={polygonPoints(3, r)} {...common} />
    case 'diamond':
      return <polygon points={polygonPoints(4, r)} {...common} />
    case 'pentagon':
      return <polygon points={polygonPoints(5, r)} {...common} />
    case 'hexagon':
      return <polygon points={polygonPoints(6, r)} {...common} />
    case 'star':
      return <polygon points={starPoints(r)} {...common} />
    case 'trapezoid':
      return (
        <polygon
          points={`${-r},${r * 0.7} ${r},${r * 0.7} ${r * 0.55},${-r * 0.7} ${-r * 0.55},${-r * 0.7}`}
          {...common}
        />
      )
    case 'halfcircle':
      return <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`} {...common} />
    case 'arrow':
      return (
        <polygon
          points={`0,${-r} ${r * 0.6},${-r * 0.1} ${r * 0.25},${-r * 0.1} ${r * 0.25},${r} ${-r * 0.25},${r} ${-r * 0.25},${-r * 0.1} ${-r * 0.6},${-r * 0.1}`}
          {...common}
        />
      )
    case 'cross':
      return (
        <polygon
          points={`${-r * 0.33},${-r} ${r * 0.33},${-r} ${r * 0.33},${-r * 0.33} ${r},${-r * 0.33} ${r},${r * 0.33} ${r * 0.33},${r * 0.33} ${r * 0.33},${r} ${-r * 0.33},${r} ${-r * 0.33},${r * 0.33} ${-r},${r * 0.33} ${-r},${-r * 0.33} ${-r * 0.33},${-r * 0.33}`}
          {...common}
        />
      )
    case 'heart':
      return (
        <path
          d={`M 0 ${r * 0.85} C ${-r * 1.4} ${-r * 0.1} ${-r * 0.5} ${-r} 0 ${-r * 0.35} C ${r * 0.5} ${-r} ${r * 1.4} ${-r * 0.1} 0 ${r * 0.85} Z`}
          {...common}
        />
      )
    case 'circle':
    default:
      return <circle cx={0} cy={0} r={r} {...common} />
  }
}

// `half` is drawn as an extra clipped overlay rather than a paint server,
// because "half filled" is a distinct visual attribute items key patterns on.
function HalfOverlay({ kind, r, color, id }) {
  return (
    <>
      <clipPath id={`half-${id}`}>
        <rect x={-r} y={-r} width={r} height={r * 2} />
      </clipPath>
      <g clipPath={`url(#half-${id})`}>
        <Shape kind={kind} r={r} stroke="none" fillRef={color} />
      </g>
    </>
  )
}

let patternSeq = 0

/** One cell of a figural item: the frame plus n copies of the shape. */
export function FigCell({ spec, boxed = true, px = 76 }) {
  const c = typeof spec === 'string' ? parseCell(spec) : spec
  const uid = `fa${(patternSeq = (patternSeq + 1) % 100000)}`
  const color = COLORS[c.color] || INK
  const pad = 8
  const inner = px - pad * 2

  if (c.blank) {
    return (
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="fig-cell is-blank">
        <rect
          x={pad / 2}
          y={pad / 2}
          width={px - pad}
          height={px - pad}
          rx={8}
          fill="#fff"
          stroke={ACCENT}
          strokeWidth={2}
          strokeDasharray="6 5"
        />
        <text
          x={px / 2}
          y={px / 2 + 9}
          textAnchor="middle"
          fontSize={26}
          fontWeight="700"
          fill={ACCENT}
        >
          ?
        </text>
      </svg>
    )
  }

  // Copies are laid out on a shrinking grid so 1..6 all stay inside the frame.
  const cols = c.n <= 1 ? 1 : c.n <= 4 ? 2 : 3
  const rows = Math.ceil(c.n / cols)
  const cellW = inner / cols
  const cellH = inner / rows
  const base = Math.min(cellW, cellH) / 2 - 3
  const r = Math.max(5, base * (SIZES[c.size] || SIZES.m))

  const copies = []
  for (let i = 0; i < c.n; i++) {
    const col = i % cols
    const row = Math.floor(i / cols)
    const cx = pad + cellW * col + cellW / 2
    const cy = pad + cellH * row + cellH / 2
    const fillRef =
      c.fill === 'solid'
        ? color
        : c.fill === 'dots'
          ? `url(#dots-${uid})`
          : c.fill === 'stripes'
            ? `url(#stripes-${uid})`
            : c.fill === 'grid'
              ? `url(#grid-${uid})`
              : 'none'
    copies.push(
      <g key={i} transform={`translate(${cx} ${cy}) rotate(${c.rot})`}>
        <Shape kind={c.shape} r={r} stroke={color} fillRef={fillRef} />
        {c.fill === 'half' && (
          <HalfOverlay kind={c.shape} r={r} color={color} id={`${uid}-${i}`} />
        )}
      </g>
    )
  }

  const dotPos = {
    tl: [pad + 6, pad + 6],
    tr: [px - pad - 6, pad + 6],
    bl: [pad + 6, px - pad - 6],
    br: [px - pad - 6, px - pad - 6],
    c: [px / 2, px / 2],
  }[c.dot]

  return (
    <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="fig-cell">
      <defs>
        <pattern id={`dots-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill="#fff" />
          <circle cx="3.5" cy="3.5" r="1.4" fill={color} />
        </pattern>
        <pattern
          id={`stripes-${uid}`}
          width="7"
          height="7"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="7" height="7" fill="#fff" />
          <rect width="3" height="7" fill={color} />
        </pattern>
        <pattern id={`grid-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#fff" />
          <path d="M0 0 H8 M0 0 V8" stroke={color} strokeWidth="1.2" />
        </pattern>
      </defs>
      {boxed && (
        <rect
          x={pad / 2}
          y={pad / 2}
          width={px - pad}
          height={px - pad}
          rx={8}
          fill="#fff"
          stroke="#c9d6cf"
          strokeWidth={1.5}
        />
      )}
      {copies}
      {dotPos && <circle cx={dotPos[0]} cy={dotPos[1]} r={3.5} fill={WARM} />}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// layouts
// ---------------------------------------------------------------------------

// dir="rtl" is set explicitly: FractionArt wraps every art token in a dir="ltr"
// container (right for equations and number lines), but a shape series must run
// in the direction the student reads, or the "next" cell lands on the wrong end.
function Row({ cells, px }) {
  return (
    <div className="fig-row" dir="rtl">
      {cells.map((c, i) => (
        <FigCell key={i} spec={c} px={px} />
      ))}
    </div>
  )
}

function Matrix({ rows, px }) {
  return (
    <div className="fig-matrix" dir="rtl">
      {rows.map((row, r) => (
        <div className="fig-row" key={r}>
          {row.map((c, i) => (
            <FigCell key={i} spec={c} px={px} />
          ))}
        </div>
      ))}
    </div>
  )
}

function Pair({ left, right, px }) {
  // "A is to B as C is to ?" — the two halves are separated visually so the
  // student reads the relation inside each pair, not across the whole row.
  return (
    <div className="fig-pair" dir="rtl">
      <div className="fig-pair-half">
        <FigCell spec={left[0]} px={px} />
        <span className="fig-op">←</span>
        <FigCell spec={left[1]} px={px} />
      </div>
      <span className="fig-sep">:</span>
      <div className="fig-pair-half">
        <FigCell spec={right[0]} px={px} />
        <span className="fig-op">←</span>
        <FigCell spec={right[1]} px={px} />
      </div>
    </div>
  )
}

/**
 * Render one `{{fig…:…}}` token body. `name` is the token name without the
 * `fig` prefix stripped — callers pass the full name.
 */
export function renderFigureToken(name, param, px) {
  const body = String(param ?? '')
  switch (name) {
    case 'figcell':
      return <FigCell spec={body} px={px || 76} />
    case 'figrow':
    case 'figodd':
      return <Row cells={body.split(';')} px={px || 76} />
    case 'figmatrix': {
      const rows = body.split('/').map((r) => r.split(';'))
      return <Matrix rows={rows} px={px || 68} />
    }
    case 'figpair': {
      const [a, b] = body.split('/')
      return (
        <Pair
          left={String(a || '').split(';')}
          right={String(b || '').split(';')}
          px={px || 68}
        />
      )
    }
    default:
      return null
  }
}

// Registered into FractionArt's KINDS map, so MathText needs no changes and an
// item can mix a figural token into ordinary prose like any other illustration.
export const FIGURE_KINDS = {
  figcell: ({ param }) => renderFigureToken('figcell', param),
  figrow: ({ param }) => renderFigureToken('figrow', param),
  figodd: ({ param }) => renderFigureToken('figodd', param),
  figmatrix: ({ param }) => renderFigureToken('figmatrix', param),
  figpair: ({ param }) => renderFigureToken('figpair', param),
}

export default function FigureArt({ name, param, px }) {
  return renderFigureToken(name, param, px)
}
