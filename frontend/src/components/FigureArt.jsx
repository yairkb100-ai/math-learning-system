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
//   {{figcarpet:<c>;<c>/<c>;<c>}}         a carpet: 2–6 × 2–6 tiles, drawn edge
//                                          to edge, "?" for the missing tile
//   {{figfold:size=4;fold=r2l;hole=1,1}}   fold-and-punch, drawn as a strip:
//                                          open sheet → each fold → punched
//                                          stack → "?"
//   {{figpunched:size=4;hole=0,1}}         the OPEN sheet with holes — this is
//                                          what the four options are
//
// Rows read right-to-left, matching how a Hebrew-speaking student scans them.

const INK = '#1d3b34'
const ACCENT = '#1f7a8c'
const WARM = '#c98a1e'
const FILL_SOFT = '#dfeae4'
// The same hairline the .fig-cell frame uses — named once so the paper grid
// of {{figfold}} / {{figpunched}} and the carpet's tile separators match it.
const GRID_LINE = '#c9d6cf'

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

export function Shape({ kind, r, stroke, fillRef }) {
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

// ---------------------------------------------------------------------------
// fold & punch — {{figfold}} / {{figpunched}}
// ---------------------------------------------------------------------------
// A square sheet is folded a few times, a punch goes through the folded stack,
// and the student says what the re-opened sheet looks like. The unfolding is
// *computed*, never eyeballed: scripts/foldcheck.py owns the semantics and
// scripts/check_fold_items.py runs every bank item through it. The three
// helpers below are a straight port of that Python, so the drawing and the
// validator cannot drift apart.
//
// COORDINATES, as everywhere else in this file: r=0 is the top row, c=0 is the
// RIGHTMOST column (the sheet reads right-to-left). After a fold the remaining
// rectangle is re-indexed in its own frame, again r=0 top, c=0 at its right.
//
// FOLDS. Each fold names the half that lands on top of the other, so what is
// left is the *other* half: r2l keeps the left half, l2r the right, t2b the
// bottom, b2t the top. Unfolding is reflection across every fold line, in
// reverse order.

const FOLD_NAMES = ['r2l', 'l2r', 't2b', 'b2t']

/** [rows, cols] of the stack after applying `folds` to a size×size sheet. */
export function foldedDims(size, folds) {
  let h = parseInt(size, 10)
  if (!(h >= 2)) throw new Error(`size must be at least 2, got ${size}`)
  let w = h
  for (const f of folds) {
    if (!FOLD_NAMES.includes(f)) throw new Error(`unknown fold ${f}`)
    if (f === 'r2l' || f === 'l2r') {
      if (w % 2) throw new Error(`cannot halve a width of ${w} with fold ${f}`)
      w /= 2
    } else {
      if (h % 2) throw new Error(`cannot halve a height of ${h} with fold ${f}`)
      h /= 2
    }
  }
  return [h, w]
}

const cellKey = (r, c) => `${r},${c}`
const cellOfKey = (k) => k.split(',').map(Number)

/**
 * Open the sheet back up: holes addressed in the folded stack's own frame come
 * back as cells of the full size×size sheet — up to 2**folds.length each.
 */
export function unfoldHoles(size, folds, holes) {
  let [h, w] = foldedDims(size, folds)
  holes.forEach(([r, c]) => {
    if (!(r >= 0 && r < h && c >= 0 && c < w)) {
      throw new Error(`hole (${r},${c}) is outside the ${h}x${w} folded stack`)
    }
  })
  let cells = new Set(holes.map(([r, c]) => cellKey(r, c)))
  // Reverse order: the last fold made is the first one opened.
  for (let i = folds.length - 1; i >= 0; i--) {
    const f = folds[i]
    const opened = new Set()
    if (f === 'r2l' || f === 'l2r') {
      const parentW = w * 2
      // r2l keeps the left half  -> parent columns w..2w-1, so c += w.
      // l2r keeps the right half -> parent columns 0..w-1,  so c stays.
      const shift = f === 'r2l' ? w : 0
      cells.forEach((k) => {
        const [r, c] = cellOfKey(k)
        const c0 = c + shift
        opened.add(cellKey(r, c0))
        opened.add(cellKey(r, parentW - 1 - c0))
      })
      w = parentW
    } else {
      const parentH = h * 2
      // t2b keeps the bottom half -> parent rows h..2h-1, so r += h.
      // b2t keeps the top half    -> parent rows 0..h-1,  so r stays.
      const shift = f === 't2b' ? h : 0
      cells.forEach((k) => {
        const [r, c] = cellOfKey(k)
        const r0 = r + shift
        opened.add(cellKey(r0, c))
        opened.add(cellKey(parentH - 1 - r0, c))
      })
      h = parentH
    }
    cells = opened
  }
  return [...cells].map(cellOfKey)
}

/** `size=4;fold=r2l;fold=b2t;hole=1,1` -> { size, folds, holes }. */
export function parseFoldSpec(param) {
  let size = 4
  const folds = []
  const holes = []
  String(param ?? '')
    .split(';')
    .forEach((clause) => {
      const s = clause.trim()
      if (!s) return
      const eq = s.indexOf('=')
      const k = (eq === -1 ? s : s.slice(0, eq)).trim()
      const v = (eq === -1 ? '' : s.slice(eq + 1)).trim()
      if (k === 'size') {
        size = parseInt(v, 10)
        if (!(size >= 2 && size <= 6)) throw new Error(`size must be 2-6, got ${v}`)
      } else if (k === 'fold') {
        folds.push(v)
      } else if (k === 'hole') {
        const [r, c] = v.split(',')
        holes.push([parseInt(r, 10), parseInt(c, 10)])
      } else {
        throw new Error(`unknown clause ${s} in figfold`)
      }
    })
  if (!holes.length) throw new Error('figfold needs at least one hole=r,c')
  return { size, folds, holes }
}

/** `size=4;hole=0,1;hole=0,2` -> { size, holes } on the OPEN sheet. */
export function parsePunchedSpec(param) {
  let size = 4
  const seen = new Set()
  String(param ?? '')
    .split(';')
    .forEach((clause) => {
      const s = clause.trim()
      if (!s) return
      const eq = s.indexOf('=')
      const k = (eq === -1 ? s : s.slice(0, eq)).trim()
      const v = (eq === -1 ? '' : s.slice(eq + 1)).trim()
      if (k === 'size') size = parseInt(v, 10)
      else if (k === 'hole') {
        const [r, c] = v.split(',')
        seen.add(cellKey(parseInt(r, 10), parseInt(c, 10)))
      } else throw new Error(`unknown clause ${s} in figpunched`)
    })
  return { size, holes: [...seen].map(cellOfKey) }
}

// --- drawing ---------------------------------------------------------------

// A short arrow, drawn by hand rather than with a <marker> so it needs no ids
// (several of these can share one page with no chance of a collision).
function TinyArrow({ x1, y1, x2, y2, color = ACCENT, width = 1.8 }) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const head = 7
  const halfW = 4.2
  const bx = x2 - ux * head
  const by = y2 - uy * head
  return (
    <g>
      <line x1={x1} y1={y1} x2={bx} y2={by} stroke={color} strokeWidth={width} strokeLinecap="round" />
      <polygon
        points={`${x2},${y2} ${bx - uy * halfW},${by + ux * halfW} ${bx + uy * halfW},${by - ux * halfW}`}
        fill={color}
      />
    </g>
  )
}

/**
 * One sheet (or folded stack): the paper, its faint cell grid, the punched
 * holes, and — when another fold follows — the fold line with the moving half
 * shaded, which is the only thing that tells r2l from l2r on a square sheet.
 */
function Paper({ h, w, cell, holes = [], nextFold = null }) {
  const W = w * cell
  const H = h * cell
  const grid = []
  for (let i = 1; i < w; i++) {
    grid.push(<line key={`v${i}`} x1={i * cell} y1={0} x2={i * cell} y2={H} stroke={GRID_LINE} strokeWidth={0.7} />)
  }
  for (let i = 1; i < h; i++) {
    grid.push(<line key={`h${i}`} x1={0} y1={i * cell} x2={W} y2={i * cell} stroke={GRID_LINE} strokeWidth={0.7} />)
  }

  let moving = null
  let foldLine = null
  let foldArrow = null
  if (nextFold === 'r2l' || nextFold === 'l2r') {
    const right = nextFold === 'r2l'
    moving = <rect x={right ? W / 2 : 0} y={0} width={W / 2} height={H} fill={FILL_SOFT} />
    foldLine = <line x1={W / 2} y1={-2} x2={W / 2} y2={H + 2} stroke={ACCENT} strokeWidth={1.8} strokeDasharray="5 4" />
    const from = right ? W * 0.82 : W * 0.18
    const to = right ? W * 0.56 : W * 0.44
    foldArrow = <TinyArrow x1={from} y1={H / 2} x2={to} y2={H / 2} />
  } else if (nextFold === 't2b' || nextFold === 'b2t') {
    const top = nextFold === 't2b'
    moving = <rect x={0} y={top ? 0 : H / 2} width={W} height={H / 2} fill={FILL_SOFT} />
    foldLine = <line x1={-2} y1={H / 2} x2={W + 2} y2={H / 2} stroke={ACCENT} strokeWidth={1.8} strokeDasharray="5 4" />
    const from = top ? H * 0.18 : H * 0.82
    const to = top ? H * 0.44 : H * 0.56
    foldArrow = <TinyArrow x1={W / 2} y1={from} x2={W / 2} y2={to} />
  }

  return (
    <g>
      <rect x={0} y={0} width={W} height={H} fill="#fff" stroke={INK} strokeWidth={1.6} />
      {moving}
      {grid}
      {foldLine}
      {foldArrow}
      {holes.map(([r, c], i) => (
        <circle
          key={`p${i}`}
          cx={(w - 1 - c) * cell + cell / 2}
          cy={r * cell + cell / 2}
          r={cell * 0.27}
          fill={INK}
        />
      ))}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke={INK} strokeWidth={1.6} />
    </g>
  )
}

/** The blank panel that asks "and opened up again, what does it look like?" */
function QuestionPanel({ side }) {
  return (
    <g>
      <rect
        x={0}
        y={0}
        width={side}
        height={side}
        rx={7}
        fill="#fff"
        stroke={ACCENT}
        strokeWidth={2}
        strokeDasharray="6 5"
      />
      <text
        x={side / 2}
        y={side / 2 + side * 0.16}
        textAnchor="middle"
        fontSize={side * 0.45}
        fontWeight="700"
        fill={ACCENT}
      >
        ?
      </text>
    </g>
  )
}

/**
 * The whole story as one right-to-left strip: the open sheet, the stack after
 * each fold, the punched stack, and the "?" panel. Every panel is drawn at the
 * same scale, so the paper visibly halves at each step.
 */
function FoldStrip({ size, folds, holes, px }) {
  const cell = Math.max(9, Math.min(20, Math.round((px || 104) / size)))
  const slot = size * cell
  const gap = 26
  const pad = 8

  const panels = [{ h: size, w: size, nextFold: folds[0] || null, holes: [] }]
  folds.forEach((f, i) => {
    const [h, w] = foldedDims(size, folds.slice(0, i + 1))
    panels.push({ h, w, nextFold: folds[i + 1] || null, holes: [] })
  })
  // The punch goes through the last state — the folded stack.
  panels[panels.length - 1].holes = holes

  const total = panels.length + 1
  const W = total * slot + (total - 1) * gap + pad * 2
  const H = slot + pad * 2
  const slotX = (i) => W - pad - (i + 1) * slot - i * gap

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="fig-fold" role="img">
      {panels.map((p, i) => (
        <g
          key={`s${i}`}
          transform={`translate(${slotX(i) + (slot - p.w * cell) / 2} ${pad + (slot - p.h * cell) / 2})`}
        >
          <Paper h={p.h} w={p.w} cell={cell} holes={p.holes} nextFold={p.nextFold} />
        </g>
      ))}
      <g transform={`translate(${slotX(total - 1)} ${pad})`}>
        <QuestionPanel side={slot} />
      </g>
      {panels.map((_, i) => (
        <TinyArrow
          key={`a${i}`}
          x1={slotX(i) - 5}
          y1={H / 2}
          x2={slotX(i) - gap + 5}
          y2={H / 2}
          color={WARM}
        />
      ))}
    </svg>
  )
}

function FoldFigure({ param, px }) {
  try {
    const { size, folds, holes } = parseFoldSpec(param)
    unfoldHoles(size, folds, holes) // validates dims and hole bounds
    return <FoldStrip size={size} folds={folds} holes={holes} px={px} />
  } catch {
    return null
  }
}

/**
 * The OPEN sheet with holes — this is what the four answer options are, so it
 * has to stay small and stay readable small.
 */
function PunchedFigure({ param, px }) {
  let size
  let holes
  try {
    ;({ size, holes } = parsePunchedSpec(param))
    if (!(size >= 2 && size <= 8)) return null
  } catch {
    return null
  }
  const cell = Math.max(11, Math.min(26, Math.round((px || 92) / size)))
  const pad = 5
  const side = size * cell + pad * 2
  return (
    <svg width={side} height={side} viewBox={`0 0 ${side} ${side}`} className="fig-punched" role="img">
      <g transform={`translate(${pad} ${pad})`}>
        <Paper h={size} w={size} cell={cell} holes={holes.filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size)} />
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// carpet — {{figcarpet}}
// ---------------------------------------------------------------------------
// Same cell grammar as a matrix, but the tiles touch: a carpet is read as one
// repeating surface, and the moment the tiles get gaps and rounded frames the
// eye starts reading a table of separate pictures instead. Hence the 1px gap
// over a dark backdrop (that gap *is* the separating line) and boxed={false}
// on the cells.

function Carpet({ rows, px }) {
  const cols = Math.max(...rows.map((r) => r.length))
  const cell = px || (Math.max(cols, rows.length) >= 5 ? 46 : 56)
  return (
    <div
      className="fig-carpet"
      dir="rtl"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: '1px',
        background: GRID_LINE,
        border: `2px solid ${INK}`,
        borderRadius: '4px',
        overflow: 'hidden',
        maxWidth: '100%',
      }}
    >
      {rows.map((row, r) => (
        <div key={r} style={{ display: 'flex', gap: '1px' }}>
          {row.map((spec, i) => (
            <div key={i} style={{ background: '#fff', display: 'flex' }}>
              <FigCell spec={spec} boxed={false} px={cell} />
            </div>
          ))}
        </div>
      ))}
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
    case 'figcarpet': {
      const rows = body.split('/').map((r) => r.split(';'))
      return <Carpet rows={rows} px={px} />
    }
    case 'figfold':
      return <FoldFigure param={body} px={px} />
    case 'figpunched':
      return <PunchedFigure param={body} px={px} />
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
  figcarpet: ({ param }) => renderFigureToken('figcarpet', param),
  figfold: ({ param }) => renderFigureToken('figfold', param),
  figpunched: ({ param }) => renderFigureToken('figpunched', param),
}

export default function FigureArt({ name, param, px }) {
  return renderFigureToken(name, param, px)
}
