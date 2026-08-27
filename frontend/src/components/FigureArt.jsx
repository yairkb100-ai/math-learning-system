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
//   in     a second shape drawn INSIDE the first, same vocabulary as `shape`.
//          `infill` / `incolor` set its fill and colour. This is what makes an
//          outer↔inner swap ("star holding a circle" → "circle holding a star")
//          expressible, which is one of the relations the real exam leans on.
//   edge   solid | dashed | corners                           (default solid)
//          `dashed` draws the same outline as a broken line; `corners` draws
//          ONLY the vertices, as pac-man discs whose mouths are the interior
//          angles — the shape is not drawn at all, it is implied by the gaps.
//          The trio solid → dashed → corners is a real Karni progression, so
//          the three are deliberately one attribute and not three shapes.
//   merge  on — the `n` copies are pushed together and drawn as ONE silhouette
//          (only the outer contour survives). This is the part↔whole relation:
//          four separate circles versus the single scalloped hill they make.
//   panel  several DIFFERENT shapes in one cell, split into sub-panels by
//          divider lines, e.g. "panel=c-s-t-r". One letter per sub-panel,
//          "-" between them (as in `board`), "*" after a letter fills it:
//            c circle · s square · t triangle · d diamond · p pentagon
//            h hexagon · r star · x empty
//          Two letters draw side by side, three in a row, four as a 2×2.
//          This is the layout family: the same shapes redistributed, the
//          fill moving from one sub-panel to another, a shape travelling
//          through the panels.
//   group  identical to `panel` but WITHOUT the divider lines — the shapes
//          share one undivided cell. `group=…` → `panel=…` is exactly the
//          "these shapes get separated" relation, and it only reads as one
//          relation because both sides are drawn by the same code.
//   board  a black/white square board, e.g. "board=110-011-001" for 3×3.
//          "-" separates rows (","/";"/"/" are already taken). Per cell:
//          0 empty · 1 filled · x empty with an ✕ · + empty with a ✚.
//          A board replaces the shape entirely; other shape attributes are
//          ignored. Boards are their own family of items (grid patterns), and
//          being a cell attribute they drop straight into rows and matrices.
//
// Example: "shape=triangle,n=2,fill=solid,rot=90"
// Example: "shape=square,in=circle,infill=solid"   (square holding a disc)
// Example: "shape=triangle,edge=corners"           (implied triangle)
// Example: "shape=circle,n=4,merge=on"             (one scalloped silhouette)
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

// Re-exported so SpatialArt.jsx (cube nets, isometric block stacks, mirror
// images) can draw with the exact same ink/accent/warm palette and the same
// shape vocabulary instead of inventing a second one — a triangle face-mark on
// a cube net must look like the same triangle a figural item would draw.
export { INK, ACCENT, WARM, COLORS, SIZES }

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
    in: null,
    infill: 'none',
    incolor: null,
    edge: 'solid',
    merge: null,
    board: null,
    panel: null,
    group: null,
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

// Vertices of the polygon kinds, in draw order. `edge=corners` needs the
// actual corner points and the two edge directions leaving each one, which the
// point-string helpers above throw away.
function vertsFor(kind, r) {
  const poly = (sides, startAngle = -90) => {
    const pts = []
    for (let i = 0; i < sides; i++) {
      const a = ((startAngle + (360 / sides) * i) * Math.PI) / 180
      pts.push([r * Math.cos(a), r * Math.sin(a)])
    }
    return pts
  }
  switch (kind) {
    case 'square':
      return [
        [-r, -r],
        [r, -r],
        [r, r],
        [-r, r],
      ]
    case 'triangle':
      return poly(3)
    case 'diamond':
      return poly(4)
    case 'pentagon':
      return poly(5)
    case 'hexagon':
      return poly(6)
    default:
      return null
  }
}

// One "pac-man" disc sitting on a corner: a full circle minus the wedge the
// polygon's interior occupies, so the missing mouths are what reconstructs the
// shape in the student's head. Built as a sampled polyline rather than an SVG
// arc command on purpose — the large-arc/sweep flags depend on the winding of
// each kind, and getting one of them wrong silently draws the complementary
// wedge, which is a distractor-shaped bug.
function pacmanPath(v, prev, next, rc) {
  const unit = (a, b) => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const L = Math.hypot(dx, dy) || 1
    return [dx / L, dy / L]
  }
  const d1 = unit(v, prev)
  const d2 = unit(v, next)
  const a1 = Math.atan2(d2[1], d2[0])
  const a2 = Math.atan2(d1[1], d1[0])
  // The mouth spans the interior angle; the disc keeps the reflex remainder,
  // which is the side the outward bisector points to.
  const am = Math.atan2(-(d1[1] + d2[1]), -(d1[0] + d2[0]))
  const TWO = Math.PI * 2
  const norm = (x) => ((x % TWO) + TWO) % TWO
  const ccwSpan = norm(a2 - a1)
  const ccw = norm(am - a1) < ccwSpan
  const span = ccw ? ccwSpan : ccwSpan - TWO
  const steps = 24
  let d = `M ${v[0].toFixed(2)} ${v[1].toFixed(2)}`
  for (let i = 0; i <= steps; i++) {
    const a = a1 + (span * i) / steps
    d += ` L ${(v[0] + rc * Math.cos(a)).toFixed(2)} ${(v[1] + rc * Math.sin(a)).toFixed(2)}`
  }
  return `${d} Z`
}

export function Shape({ kind, r, stroke, fillRef, dash = false }) {
  const common = {
    fill: fillRef,
    stroke,
    strokeWidth: 2,
    strokeLinejoin: 'round',
    ...(dash ? { strokeDasharray: '6 4' } : null),
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

// One copy of the cell's shape: the outline (solid / dashed / implied by its
// corners) plus the optional nested shape. Kept separate from FigCell so a
// merged silhouette and a plain cell agree on what "one shape" looks like.
function CellShape({ c, r, color, inColor, fillOf }) {
  const verts = c.edge === 'corners' ? vertsFor(c.shape, r) : null
  if (verts) {
    const rc = Math.max(4, r * 0.36)
    return (
      <>
        {verts.map((v, k) => (
          <path
            key={k}
            d={pacmanPath(
              v,
              verts[(k - 1 + verts.length) % verts.length],
              verts[(k + 1) % verts.length],
              rc
            )}
            fill={c.fill === 'solid' ? color : '#fff'}
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
          />
        ))}
      </>
    )
  }
  return (
    <>
      <Shape
        kind={c.shape}
        r={r}
        stroke={color}
        fillRef={fillOf(c.fill, color)}
        dash={c.edge === 'dashed'}
      />
      {c.in && (
        <Shape
          kind={c.in}
          r={r * 0.44}
          stroke={inColor}
          fillRef={fillOf(c.infill, inColor)}
        />
      )}
    </>
  )
}

// `merge=on`: the copies are drawn as a single outer contour. The union fill
// is painted first, then the outlines are re-drawn through a mask that hides
// everything already inside the union — so the seams between the copies vanish
// and four circles read as one scalloped hill.
function MergedSilhouette({ c, r, color, fillOf, uid, positions }) {
  const at = (extra) =>
    positions.map(([x, y], i) => (
      <g key={i} transform={`translate(${x} ${y})`}>
        {extra(i)}
      </g>
    ))
  return (
    <>
      <mask id={`union-${uid}`} maskUnits="userSpaceOnUse" x={-9999} y={-9999} width={19998} height={19998}>
        <rect x={-9999} y={-9999} width={19998} height={19998} fill="#fff" />
        {at(() => <Shape kind={c.shape} r={r} stroke="none" fillRef="#000" />)}
      </mask>
      {c.fill !== 'none' &&
        at(() => <Shape kind={c.shape} r={r} stroke="none" fillRef={fillOf(c.fill, color)} />)}
      <g mask={`url(#union-${uid})`}>
        {at(() => (
          <Shape kind={c.shape} r={r} stroke={color} fillRef="none" dash={c.edge === 'dashed'} />
        ))}
      </g>
    </>
  )
}

// Sub-panel shape codes. Deliberately one letter each: a sub-panel cannot use
// the full `key=value` grammar, because "," and "=" already belong to the
// attribute level, and a nested escape would be unreadable in a bank file.
const PANEL_SHAPES = {
  c: 'circle',
  s: 'square',
  t: 'triangle',
  d: 'diamond',
  p: 'pentagon',
  h: 'hexagon',
  r: 'star',
  x: null,
}

// A cell split into sub-panels, each holding its own shape — the layout family
// (shapes redistributed, regrouped, or travelling between panels). `dividers`
// is what separates "panel" from "group": same shapes, same places, only the
// lines differ, so an item can key on the split itself.
function Panel({ codes, px, pad, color, dividers }) {
  const k = codes.length
  const cols = k <= 3 ? k : 2
  const rows = Math.ceil(k / cols)
  const inner = px - pad * 2
  const cw = inner / cols
  const ch = inner / rows
  const r = Math.max(4, Math.min(cw, ch) / 2 - 4)

  const shapes = codes.map((code, i) => {
    const kind = PANEL_SHAPES[code[0]]
    if (!kind) return null
    const col = i % cols
    const row = Math.floor(i / cols)
    return (
      <g
        key={`s${i}`}
        transform={`translate(${pad + cw * col + cw / 2} ${pad + ch * row + ch / 2})`}
      >
        <Shape kind={kind} r={r} stroke={color} fillRef={code.includes('*') ? color : 'none'} />
      </g>
    )
  })

  const lines = []
  if (dividers) {
    for (let i = 1; i < cols; i++) {
      lines.push(
        <line
          key={`v${i}`}
          x1={pad + cw * i}
          y1={pad}
          x2={pad + cw * i}
          y2={px - pad}
          stroke={color}
          strokeWidth={1.5}
        />
      )
    }
    for (let i = 1; i < rows; i++) {
      lines.push(
        <line
          key={`h${i}`}
          x1={pad}
          y1={pad + ch * i}
          x2={px - pad}
          y2={pad + ch * i}
          stroke={color}
          strokeWidth={1.5}
        />
      )
    }
  }
  return (
    <>
      {lines}
      {shapes}
    </>
  )
}

// A black/white board — the "which square completes the pattern" family. Drawn
// as its own thing rather than as n copies of `square`, because the pattern is
// carried by which *positions* are filled, and positions are what the copy
// grid deliberately abstracts away.
function Board({ rows, px, pad, color }) {
  const k = Math.max(rows.length, ...rows.map((r) => r.length))
  const inner = px - pad * 2
  const gap = inner / (k * 7)
  const cell = (inner - gap * (k - 1)) / k
  const out = []
  rows.forEach((row, ri) => {
    for (let ci = 0; ci < k; ci++) {
      const ch = row[ci] || '0'
      const x = pad + ci * (cell + gap)
      const y = pad + ri * (cell + gap)
      out.push(
        <rect
          key={`r${ri}-${ci}`}
          x={x}
          y={y}
          width={cell}
          height={cell}
          fill={ch === '1' ? color : '#fff'}
          stroke={color}
          strokeWidth={1.5}
        />
      )
      if (ch === 'x') {
        out.push(
          <path
            key={`m${ri}-${ci}`}
            d={`M ${x + cell * 0.2} ${y + cell * 0.2} L ${x + cell * 0.8} ${y + cell * 0.8} M ${x + cell * 0.8} ${y + cell * 0.2} L ${x + cell * 0.2} ${y + cell * 0.8}`}
            stroke={color}
            strokeWidth={1.5}
          />
        )
      } else if (ch === '+') {
        out.push(
          <path
            key={`m${ri}-${ci}`}
            d={`M ${x + cell / 2} ${y + cell * 0.18} V ${y + cell * 0.82} M ${x + cell * 0.18} ${y + cell / 2} H ${x + cell * 0.82}`}
            stroke={color}
            strokeWidth={1.5}
          />
        )
      }
    }
  })
  return <>{out}</>
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

  const fillOf = (mode, tint) =>
    mode === 'solid'
      ? tint
      : mode === 'dots'
        ? `url(#dots-${uid})`
        : mode === 'stripes'
          ? `url(#stripes-${uid})`
          : mode === 'grid'
            ? `url(#grid-${uid})`
            : 'none'
  const inColor = COLORS[c.incolor] || color

  // Copies are laid out on a shrinking grid so 1..6 all stay inside the frame.
  const cols = c.n <= 1 ? 1 : c.n <= 4 ? 2 : 3
  const rows = Math.ceil(c.n / cols)
  const cellW = inner / cols
  const cellH = inner / rows
  const base = Math.min(cellW, cellH) / 2 - 3
  const r = Math.max(5, base * (SIZES[c.size] || SIZES.m))

  let body
  if (c.board) {
    body = <Board rows={c.board.split('-')} px={px} pad={pad} color={color} />
  } else if (c.panel || c.group) {
    body = (
      <Panel
        codes={(c.panel || c.group).split('-')}
        px={px}
        pad={pad}
        color={color}
        dividers={Boolean(c.panel)}
      />
    )
  } else if (c.merge) {
    // Merged copies sit on one line and overlap, so the union has no gaps: the
    // spacing is a fraction of the radius, not of the frame.
    const mr = Math.max(6, Math.min(inner / 2, inner / (0.75 * c.n + 0.9)) * (SIZES[c.size] || SIZES.m))
    const step = mr * 1.35
    const positions = []
    for (let i = 0; i < c.n; i++) {
      positions.push([px / 2 + (i - (c.n - 1) / 2) * step, px / 2])
    }
    body = (
      <MergedSilhouette c={c} r={mr} color={color} fillOf={fillOf} uid={uid} positions={positions} />
    )
  } else {
    const copies = []
    for (let i = 0; i < c.n; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const cx = pad + cellW * col + cellW / 2
      const cy = pad + cellH * row + cellH / 2
      copies.push(
        <g key={i} transform={`translate(${cx} ${cy}) rotate(${c.rot})`}>
          <CellShape c={c} r={r} color={color} inColor={inColor} fillOf={fillOf} />
          {c.fill === 'half' && c.edge !== 'corners' && (
            <HalfOverlay kind={c.shape} r={r} color={color} id={`${uid}-${i}`} />
          )}
        </g>
      )
    }
    body = <>{copies}</>
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
      {body}
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
