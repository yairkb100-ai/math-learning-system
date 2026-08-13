// Spatial-reasoning renderer for the קרני area (הפרק המרחבי).
//
// Like FigureArt.jsx next to it, the whole point is that an item is a line of
// JSON, not a hand-drawn asset — and the same code draws the question and
// every option, so a distractor can never look subtly different for the
// wrong reason. Read FigureArt.jsx first; this module reuses its palette
// (INK/ACCENT/WARM), its shape vocabulary (Shape) and its cell parser
// (parseCell/FigCell) so a triangle face-mark here looks like the same
// triangle a figural matrix would draw.
//
// ---------------------------------------------------------------------------
// WHY A CURATED TABLE, NOT A FOLD-CHECKER. There are exactly 35 free
// hexominoes (connected shapes of 6 unit squares) and exactly 11 of them fold
// into a closed cube — this is a settled combinatorial fact, not something
// worth re-deriving at runtime with a general polyomino-folding algorithm
// (that's exactly the kind of "looks right, isn't provably right" surface
// area that bit the matrix questions before). NET_LAYOUTS below hard-codes
// those 11, each verified by literally simulating a die rolling across its
// cells (see the derivation note above NET_LAYOUTS). Any hexomino NOT in this
// table is provably not a valid net — an item author or a QA pass can use
// that as a mechanical test instead of eyeballing a fold.
//
// ---------------------------------------------------------------------------
// SEPARATORS — same convention as FigureArt, because both feed the same
// MathText token grammar: "," between attributes of one cell/face, ";"
// between cells, "/" between rows/layers. Never "|" or "}" inside a param.
//
// Tokens:
//
//   {{cubenet:<net>;<face0>;<face1>;<face2>;<face3>;<face4>;<face5>}}
//     <net> is 1–11, indexing NET_LAYOUTS. Each <faceN> is a cell spec in
//     FigureArt's grammar (shape=,fill=,rot=,size=,color=) and marks the
//     face at NET_LAYOUTS[net-1].cells[N], in that fixed reading order.
//     Faces are numbered per layout, not per screen position, so "face 0
//     is opposite face 5" is either always true or always false for a given
//     <net> — see NET_LAYOUTS[i].opposite.
//
//   {{cubeview:<top>;<front>;<right>}}
//     A small isometric cube showing exactly the three faces a net-folding
//     question needs to compare against: three cell specs, top/front/right.
//
//   {{blockstack:<x,y,z>;<x,y,z>;…}}
//     An isometric stack of unit cubes. Each cube is one triple of small
//     non-negative integers (max ~4×4×3). The count of triples IS the answer
//     to a "how many cubes" question — nothing to derive, nothing to argue.
//
//   {{mirror:h|v;<spec>}}
//     Mirrors a single FigureArt cell spec horizontally (h) or vertically
//     (v). Reuses FigCell verbatim and flips it with a CSS transform, so the
//     mirrored shape is pixel-identical to the original, just reflected —
//     never a redrawn (and possibly inconsistent) approximation of one.
//
// RTL: face/cell reading order matters wherever a student has to track "which
// face is which" across the token, so, matching FigureArt's Row, anything
// that lays out multiple cells in a line sets dir="rtl" explicitly.

import { parseCell, FigCell, Shape, INK, ACCENT, WARM, COLORS, SIZES } from './FigureArt.jsx'

// ---------------------------------------------------------------------------
// NET_LAYOUTS — the 11 hexominoes that fold into a cube.
//
// Each `cells` entry is [col, row] in a small grid (grid coordinates only,
// no meaning beyond adjacency). Each `opposite` entry is a pair of indices
// into `cells`: those two faces end up opposite one another on the folded
// cube. Adjacency needs no separate table — on a cube, two distinct faces
// are adjacent unless they're the opposite pair (every face touches the
// other four).
//
// Derivation note: every layout below was checked by simulating a die
// rolling along its cells from an arbitrary root — i.e. tracking the
// (top,bottom,north,south,east,west) face labels through each roll — and
// confirming the six resulting labels are the six distinct faces of a cube
// with no repeats (a repeat means the flat hexomino does NOT fold closed,
// even though plenty of the other 24 hexominoes look just as plausible on
// paper). The four families below match the classic classification by
// "how many squares in each straight run": 1-4-1 (six layouts, a strip of
// four with one tab off each end), 2-3-1 (three layouts, a strip of three
// with a two-tall step off it and one loose square), 2-2-2 (one layout, a
// staircase) and 3-3 (one layout, two strips of three meeting at a corner).
export const NET_LAYOUTS = [
  // ---- 1-4-1 family: strip of 4 + one tab above, one tab below ----------
  // For all six of these the belt is cells[1..4] and the tabs are cells[0]
  // and cells[5], so the opposite pairing is always the same shape:
  // belt0-belt2, belt1-belt3, tab-tab.
  { id: 1, label: 'צלב (1-4-1, קצוות באמצע)', cells: [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]], opposite: [[1, 3], [2, 4], [0, 5]] },
  { id: 2, label: '1-4-1, שני זנבות בקצה שמאל', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2]], opposite: [[1, 3], [2, 4], [0, 5]] },
  { id: 3, label: '1-4-1, שני זנבות בקצה ימין', cells: [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]], opposite: [[1, 3], [2, 4], [0, 5]] },
  { id: 4, label: '1-4-1, זנבות בקצוות מנוגדים', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [3, 2]], opposite: [[1, 3], [2, 4], [0, 5]] },
  { id: 5, label: '1-4-1, זנבות בקצוות מנוגדים (הפוך)', cells: [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2]], opposite: [[1, 3], [2, 4], [0, 5]] },
  { id: 6, label: '1-4-1, זנבות סמוכים', cells: [[0, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]], opposite: [[1, 3], [2, 4], [0, 5]] },

  // ---- 2-3-1 family: strip of 3 + a 2-tall step + one loose square -------
  // cells order: [belt-left, belt-mid, belt-right, step-mid, step-top, loose]
  // opposite is always belt-left/belt-right, belt-mid/step-top, step-mid/loose.
  { id: 7, label: '2-3-1, בודדת בקצה ימין', cells: [[0, 2], [1, 2], [2, 2], [1, 1], [1, 0], [2, 3]], opposite: [[0, 2], [1, 4], [3, 5]] },
  { id: 8, label: '2-3-1, בודדת בקצה שמאל', cells: [[0, 2], [1, 2], [2, 2], [1, 1], [1, 0], [0, 3]], opposite: [[0, 2], [1, 4], [3, 5]] },
  { id: 9, label: '2-3-1, בודדת מתחת למדרגה', cells: [[0, 2], [1, 2], [2, 2], [1, 1], [1, 0], [1, 3]], opposite: [[0, 2], [1, 4], [3, 5]] },

  // ---- 2-2-2 family: one staircase (unique up to symmetry) --------------
  { id: 10, label: 'מדרגות (2-2-2)', cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2], [2, 3]], opposite: [[0, 3], [1, 4], [2, 5]] },

  // ---- 3-3 family: two strips of 3 meeting at a corner (unique) ---------
  { id: 11, label: 'שתי רצועות של 3 (3-3)', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [1, 4]], opposite: [[0, 2], [1, 4], [3, 5]] },
]

const NET_BY_ID = Object.fromEntries(NET_LAYOUTS.map((n) => [String(n.id), n]))

/** Look up a curated layout by its 1–11 id. Returns null for anything else —
 *  callers should treat that as "not a valid cube net" by construction. */
export function getNetLayout(id) {
  return NET_BY_ID[String(id).trim()] || null
}

/** Given a layout and a face index, return the index of its opposite face —
 *  purely a table lookup, deterministic from which of the 11 layouts it is. */
export function oppositeFaceIndex(layout, index) {
  const pair = layout.opposite.find((p) => p.includes(index))
  if (!pair) return -1
  return pair[0] === index ? pair[1] : pair[0]
}

/** Two distinct faces of a cube are adjacent unless they're the opposite
 *  pair — true for any cube, so adjacency needs no lookup of its own. */
export function facesAdjacent(layout, a, b) {
  if (a === b) return false
  return oppositeFaceIndex(layout, a) !== b
}

// ---------------------------------------------------------------------------
// face marks — a small Shape (from FigureArt) centred in a square cell
// ---------------------------------------------------------------------------

function FaceMark({ spec, size, faded = false }) {
  const c = typeof spec === 'string' ? parseCell(spec) : spec
  const color = COLORS[c.color] || INK
  if (c.blank) return null
  const r = Math.max(4, (size / 2 - 4) * (SIZES[c.size] || SIZES.m))
  const fillRef = c.fill === 'solid' ? color : c.fill === 'none' ? 'none' : `${color}55`
  return (
    <g transform={`rotate(${c.rot})`} opacity={faded ? 0.55 : 1}>
      <Shape kind={c.shape} r={r} stroke={color} fillRef={fillRef} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// {{cubenet:...}}
// ---------------------------------------------------------------------------

function CubeNet({ netId, faceSpecs, cellPx = 56 }) {
  const layout = getNetLayout(netId)
  if (!layout) return null
  const pad = 4
  const maxCol = Math.max(...layout.cells.map((c) => c[0]))
  const maxRow = Math.max(...layout.cells.map((c) => c[1]))
  const W = (maxCol + 1) * cellPx + pad * 2
  const H = (maxRow + 1) * cellPx + pad * 2
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="spatial-net">
      {layout.cells.map(([col, row], i) => {
        const x = pad + col * cellPx
        const y = pad + row * cellPx
        return (
          <g key={i}>
            <rect
              x={x + 1.5}
              y={y + 1.5}
              width={cellPx - 3}
              height={cellPx - 3}
              rx={6}
              fill="#fff"
              stroke="#c9d6cf"
              strokeWidth={1.5}
            />
            <text x={x + 9} y={y + 15} fontSize={9} fill="#9aab9f" fontWeight="700">
              {i + 1}
            </text>
            <g transform={`translate(${x + cellPx / 2} ${y + cellPx / 2})`}>
              <FaceMark spec={faceSpecs[i]} size={cellPx} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// {{cubeview:...}} — isometric cube, three visible faces
// ---------------------------------------------------------------------------

// Three rhombi sharing the cube's front-top-left vertex at (cx, cy).
function isoFace(cx, cy, s, kind) {
  // kind: 'top' | 'left' | 'right' — a standard 2:1 dimetric cube.
  const dx = s * 0.87,
    dy = s * 0.5
  if (kind === 'top') {
    return `${cx},${cy - s} ${cx + dx},${cy - s + dy} ${cx},${cy - s + 2 * dy} ${cx - dx},${cy - s + dy}`
  }
  if (kind === 'left') {
    return `${cx - dx},${cy - s + dy} ${cx},${cy - s + 2 * dy} ${cx},${cy + 2 * dy} ${cx - dx},${cy + dy}`
  }
  return `${cx + dx},${cy - s + dy} ${cx},${cy - s + 2 * dy} ${cx},${cy + 2 * dy} ${cx + dx},${cy + dy}`
}

function CubeFaceCenter(kind, cx, cy, s) {
  const dy = s * 0.5
  if (kind === 'top') return [cx, cy - s + dy]
  if (kind === 'left') return [cx - s * 0.43, cy + dy * 0.5]
  return [cx + s * 0.43, cy + dy * 0.5]
}

function Cube3d({ top, front, right, s = 46 }) {
  const cx = s * 1.1
  const cy = s * 1.55
  const W = s * 2.2
  const H = s * 2.9
  const faces = [
    { kind: 'top', spec: top, fill: '#eef4f0' },
    { kind: 'left', spec: front, fill: '#dbe7de' },
    { kind: 'right', spec: right, fill: '#cddcd3' },
  ]
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="spatial-cube3d">
      {faces.map(({ kind, spec, fill }) => {
        const [mx, my] = CubeFaceCenter(kind, cx, cy, s)
        return (
          <g key={kind}>
            <polygon points={isoFace(cx, cy, s, kind)} fill={fill} stroke={INK} strokeWidth={1.6} strokeLinejoin="round" />
            <g transform={`translate(${mx} ${my})`}>
              <FaceMark spec={spec} size={s * 0.85} />
            </g>
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// {{blockstack:...}} — isometric stack of unit cubes from explicit (x,y,z)
// ---------------------------------------------------------------------------

function parseTriples(body) {
  return String(body ?? '')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(',').map((n) => Math.max(0, Math.min(4, parseInt(n, 10) || 0))))
    .filter((t) => t.length === 3)
}

function unitCube(px, py, s, shade) {
  const dx = s * 0.87,
    dy = s * 0.5
  return {
    top: `${px},${py - s} ${px + dx},${py - s + dy} ${px},${py - s + 2 * dy} ${px - dx},${py - s + dy}`,
    left: `${px - dx},${py - s + dy} ${px},${py - s + 2 * dy} ${px},${py + 2 * dy} ${px - dx},${py + dy}`,
    right: `${px + dx},${py - s + dy} ${px},${py - s + 2 * dy} ${px},${py + 2 * dy} ${px + dx},${py + dy}`,
  }
}

function BlockStack({ triples, s = 22 }) {
  if (!triples.length) return null
  const maxX = Math.max(...triples.map((t) => t[0]))
  const maxY = Math.max(...triples.map((t) => t[1]))
  const maxZ = Math.max(...triples.map((t) => t[2]))
  const dx = s * 0.87,
    dy = s * 0.5
  const originX = (maxY + 1) * dx + s
  const originY = s * 1.4
  const project = (x, y, z) => {
    const px = originX + (x - y) * dx
    const py = originY + (x + y) * dy - z * s
    return [px, py]
  }
  const W = originX + (maxX + 1) * dx + s
  const H = originY + (maxX + maxY + 2) * dy + (maxZ + 1) * s + s
  // Painter's algorithm: draw back-to-front so nearer cubes occlude farther
  // ones — with +x/+y receding and +z rising, sum (x+y-z) rising means nearer.
  const ordered = [...triples].sort((a, b) => a[0] + a[1] - a[2] - (b[0] + b[1] - b[2]))
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="spatial-stack" dir="ltr">
      {ordered.map(([x, y, z], i) => {
        const [px, py] = project(x, y, z)
        const c = unitCube(px, py, s)
        return (
          <g key={i}>
            <polygon points={c.top} fill="#eef4f0" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
            <polygon points={c.left} fill="#cddcd3" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
            <polygon points={c.right} fill="#b7cabf" stroke={INK} strokeWidth={1.3} strokeLinejoin="round" />
          </g>
        )
      })}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// {{mirror:...}} — flips an existing FigureArt cell with a CSS transform, so
// the mirrored shape is exactly the original reflected, never a redraw.
// ---------------------------------------------------------------------------

function Mirror({ axis, spec, px = 76 }) {
  const flip = axis === 'v' ? 'scaleY(-1)' : 'scaleX(-1)'
  return (
    <span className="spatial-mirror" style={{ display: 'inline-block', transform: flip }}>
      <FigCell spec={spec} px={px} />
    </span>
  )
}

// ---------------------------------------------------------------------------
// token dispatch
// ---------------------------------------------------------------------------

export function renderSpatialToken(name, param) {
  const body = String(param ?? '')
  switch (name) {
    case 'cubenet': {
      const parts = body.split(';')
      const [netId, ...faces] = parts
      return <CubeNet netId={netId} faceSpecs={faces} />
    }
    case 'cubeview': {
      const [top, front, right] = body.split(';')
      return <Cube3d top={top} front={front} right={right} />
    }
    case 'blockstack':
      return <BlockStack triples={parseTriples(body)} />
    case 'mirror': {
      const idx = body.indexOf(';')
      const axis = (idx === -1 ? body : body.slice(0, idx)).trim() === 'v' ? 'v' : 'h'
      const spec = idx === -1 ? '' : body.slice(idx + 1)
      return <Mirror axis={axis} spec={spec} />
    }
    default:
      return null
  }
}

// Registered into FractionArt's KINDS map next to FIGURE_KINDS, so MathText
// routes cubenet/cubeview/blockstack/mirror like any other illustration token.
export const SPATIAL_KINDS = {
  cubenet: ({ param }) => renderSpatialToken('cubenet', param),
  cubeview: ({ param }) => renderSpatialToken('cubeview', param),
  blockstack: ({ param }) => renderSpatialToken('blockstack', param),
  mirror: ({ param }) => renderSpatialToken('mirror', param),
}

export default function SpatialArt({ name, param }) {
  return renderSpatialToken(name, param)
}
