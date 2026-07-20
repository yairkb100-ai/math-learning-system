// Cute SVG illustrations for fraction content, aimed at young learners.
// Used via {{kind:n/d|caption}} tokens inside course content (see MathText).

const NAVY = '#14306b'
const FILL = '#8ecae6'
const TOMATO = '#e8574b'

function polar(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)]
}

function wedge(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0)
  const [x1, y1] = polar(cx, cy, r, a1)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
}

function Pizza({ n, d }) {
  const slices = []
  for (let i = 0; i < d; i++) {
    const a0 = (360 / d) * i
    const a1 = (360 / d) * (i + 1)
    const filled = i < n
    slices.push(
      <path
        key={i}
        d={wedge(60, 60, 46, a0, a1)}
        fill={filled ? TOMATO : '#f7d354'}
        stroke="#b97a2a"
        strokeWidth="2"
      />
    )
    if (filled) {
      const mid = (a0 + a1) / 2
      const [px, py] = polar(60, 60, 27, mid)
      slices.push(
        <circle key={`p${i}`} cx={px} cy={py} r="5.5" fill="#a83232" />
      )
    }
  }
  return (
    <svg width="110" height="110" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="54" fill="#e8b04b" stroke="#b97a2a" strokeWidth="2" />
      <circle cx="60" cy="60" r="46" fill="#f7d354" />
      {slices}
    </svg>
  )
}

function CirclePlain({ n, d }) {
  const parts = []
  for (let i = 0; i < d; i++) {
    const a0 = (360 / d) * i
    const a1 = (360 / d) * (i + 1)
    parts.push(
      <path
        key={i}
        d={wedge(60, 60, 52, a0, a1)}
        fill={i < n ? FILL : '#fff'}
        stroke={NAVY}
        strokeWidth="2"
      />
    )
  }
  return (
    <svg width="104" height="104" viewBox="0 0 120 120">
      {parts}
    </svg>
  )
}

function Bar({ n, d }) {
  const W = 180
  const w = W / d
  const parts = []
  for (let i = 0; i < d; i++) {
    parts.push(
      <rect
        key={i}
        x={1 + i * w}
        y={1}
        width={w}
        height={46}
        fill={i < n ? FILL : '#fff'}
        stroke={NAVY}
        strokeWidth="2"
        rx="3"
      />
    )
  }
  return (
    <svg width={W + 2} height="48" viewBox={`0 0 ${W + 2} 48`}>
      {parts}
    </svg>
  )
}

// Deliberately-unequal parts, used to show what a fraction is NOT.
function BarUnequal({ d }) {
  const widths = { 3: [0.5, 0.3, 0.2], 4: [0.45, 0.25, 0.15, 0.15] }[d] || [
    0.5, 0.3, 0.2,
  ]
  const W = 180
  let x = 1
  const parts = widths.map((f, i) => {
    const rect = (
      <rect
        key={i}
        x={x}
        y={1}
        width={W * f}
        height={46}
        fill={i === 0 ? '#f4b8b2' : '#fff'}
        stroke={NAVY}
        strokeWidth="2"
        rx="3"
      />
    )
    x += W * f
    return rect
  })
  return (
    <svg width={W + 2} height="48" viewBox={`0 0 ${W + 2} 48`}>
      {parts}
      <text x={W / 2} y="33" textAnchor="middle" fontSize="24" fill="#c0392b">
        ✗
      </text>
    </svg>
  )
}

function Chocolate({ n, d }) {
  const cols = d % 4 === 0 ? 4 : d % 3 === 0 ? 3 : Math.ceil(Math.sqrt(d))
  const rows = Math.ceil(d / cols)
  const s = 30
  const squares = []
  for (let i = 0; i < d; i++) {
    const cx = (i % cols) * s
    const cy = Math.floor(i / cols) * s
    squares.push(
      <g key={i}>
        <rect
          x={cx + 2}
          y={cy + 2}
          width={s - 4}
          height={s - 4}
          rx="4"
          fill={i < n ? '#ffd166' : '#7b4a12'}
          stroke="#5d3608"
          strokeWidth="2"
        />
        <rect
          x={cx + 7}
          y={cy + 7}
          width={s - 14}
          height={s - 14}
          rx="3"
          fill="none"
          stroke={i < n ? '#d9a83c' : '#5d3608'}
          strokeWidth="1.5"
        />
      </g>
    )
  }
  return (
    <svg
      width={cols * s + 4}
      height={rows * s + 4}
      viewBox={`0 0 ${cols * s + 4} ${rows * s + 4}`}
    >
      <rect
        x="0"
        y="0"
        width={cols * s + 4}
        height={rows * s + 4}
        rx="6"
        fill="#5d3608"
      />
      {squares}
    </svg>
  )
}

function NumberLine({ n, d }) {
  const W = 240
  const x0 = 16
  const x1 = W - 16
  const ticks = []
  for (let i = 0; i <= d; i++) {
    const x = x0 + ((x1 - x0) * i) / d
    ticks.push(
      <line key={i} x1={x} y1={26} x2={x} y2={42} stroke={NAVY} strokeWidth="2" />
    )
  }
  const mx = x0 + ((x1 - x0) * n) / d
  return (
    <svg width={W} height="66" viewBox={`0 0 ${W} 66`}>
      <line x1={x0} y1={34} x2={x1} y2={34} stroke={NAVY} strokeWidth="2.5" />
      {ticks}
      <circle cx={mx} cy={34} r="7" fill={TOMATO} />
      <text x={x0} y="60" textAnchor="middle" fontSize="14" fill={NAVY}>0</text>
      <text x={x1} y="60" textAnchor="middle" fontSize="14" fill={NAVY}>1</text>
      <text x={mx} y="16" textAnchor="middle" fontSize="13" fill={TOMATO} fontWeight="700">
        {n}/{d}
      </text>
    </svg>
  )
}

// Row-major shaded grid, e.g. {{grid:10x10/30}} -> 10x10 cells, first 30 shaded.
function Grid({ param }) {
  const m = String(param || '').match(/^(\d+)x(\d+)(?:\/(\d+))?$/)
  const cols = m ? Number(m[1]) : 4
  const rows = m ? Number(m[2]) : 4
  const shaded = m && m[3] != null ? Number(m[3]) : 0
  const s = 22
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c
      cells.push(
        <rect
          key={i}
          x={c * s + 1}
          y={r * s + 1}
          width={s - 2}
          height={s - 2}
          fill={i < shaded ? FILL : '#fff'}
          stroke={NAVY}
          strokeWidth="1.5"
        />
      )
    }
  }
  return (
    <svg width={cols * s + 2} height={rows * s + 2} viewBox={`0 0 ${cols * s + 2} ${rows * s + 2}`}>
      {cells}
    </svg>
  )
}

// Parabola sketch for quadratic equations, e.g. {{parabola:up/2}}.
// param = "<up|down>/<0|1|2>": which way it opens and how many times it meets
// the x-axis (0/1/2 real roots). Shows the geometric meaning of the
// discriminant: roots are exactly where the curve crosses y=0.
function Parabola({ param }) {
  const m = String(param || 'up/2').match(/^(up|down)\/(\d)$/)
  const dir = m ? m[1] : 'up'
  const roots = m ? Number(m[2]) : 2
  const W = 220
  const H = 150
  const cx = W / 2 // x-axis origin (visual center)
  const axisY = H / 2 + 8
  const up = dir === 'up'
  // Pick a vertex height (in px from the axis) so the curve meets the axis the
  // requested number of times: below/above for 2, on it for 1, past it for 0.
  const vGap = roots === 2 ? 46 : roots === 1 ? 0 : 40
  const vertexY = up ? axisY + vGap : axisY - vGap
  // Sample the parabola y = k*(x-cx)^2 + vertexY across the width.
  const halfW = 92
  const topY = up ? 18 : H - 18 // where the arms reach
  const k = (topY - vertexY) / (halfW * halfW)
  const pts = []
  for (let i = 0; i <= 40; i++) {
    const x = cx - halfW + (2 * halfW * i) / 40
    const y = k * (x - cx) * (x - cx) + vertexY
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  // Root dots: where the sampled curve crosses the axis.
  const dots = []
  if (roots === 1) {
    dots.push(cx)
  } else if (roots === 2) {
    const dx = Math.sqrt((axisY - vertexY) / k)
    dots.push(cx - dx, cx + dx)
  }
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* axes */}
      <line x1="10" y1={axisY} x2={W - 10} y2={axisY} stroke={NAVY} strokeWidth="1.5" />
      <line x1={cx} y1="8" x2={cx} y2={H - 8} stroke="#b9c2d8" strokeWidth="1.2" />
      <text x={W - 8} y={axisY - 5} textAnchor="end" fontSize="11" fill="#8893ad">x</text>
      {/* parabola */}
      <polyline points={pts.join(' ')} fill="none" stroke={TOMATO} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* roots */}
      {dots.map((x, i) => (
        <circle key={i} cx={x} cy={axisY} r="5.5" fill={NAVY} stroke="#fff" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

// Labeled rectangle for area/measurement problems, e.g. {{rect:3.5x4.2}}.
function Rect({ param }) {
  const m = String(param || '').match(/^([\d.]+)x([\d.]+)$/)
  const w = m ? Number(m[1]) : 1
  const h = m ? Number(m[2]) : 1
  const maxW = 180
  const maxH = 110
  const scale = Math.min(maxW / w, maxH / h)
  const rw = w * scale
  const rh = h * scale
  const pad = 26
  const W = rw + pad * 2
  const H = rh + pad * 2
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <rect x={pad} y={pad} width={rw} height={rh} fill={FILL} stroke={NAVY} strokeWidth="2" rx="3" />
      <text x={pad + rw / 2} y={pad - 8} textAnchor="middle" fontSize="13" fill={NAVY} fontWeight="700">{w}</text>
      <text x={pad - 8} y={pad + rh / 2} textAnchor="middle" fontSize="13" fill={NAVY} fontWeight="700"
        transform={`rotate(-90 ${pad - 8} ${pad + rh / 2})`}>{h}</text>
    </svg>
  )
}

// Coordinate line graph, e.g. {{linegraph:0,0;1,60;2,120|מרחק לפי זמן}}.
// param = semicolon-separated "x,y" points. Auto-scales to the data (origin at
// 0), draws axes, light gridlines, a colored line and dots — for motion
// (distance–time), rate/יחס and other "graph" problems.
function LineGraph({ param }) {
  const pts = String(param || '')
    .split(';')
    .map((p) => p.split(',').map(Number))
    .filter((p) => p.length === 2 && p.every((v) => Number.isFinite(v)))
  if (pts.length === 0) return null
  const maxX = Math.max(1, ...pts.map((p) => p[0]))
  const maxY = Math.max(1, ...pts.map((p) => p[1]))
  const W = 240
  const H = 180
  const padL = 34
  const padB = 28
  const padT = 12
  const padR = 12
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const sx = (x) => padL + (plotW * x) / maxX
  const sy = (y) => H - padB - (plotH * y) / maxY
  const grid = []
  for (let i = 0; i <= 4; i++) {
    const gx = padL + (plotW * i) / 4
    const gy = padT + (plotH * i) / 4
    grid.push(<line key={`v${i}`} x1={gx} y1={padT} x2={gx} y2={H - padB} stroke="#e6ebf5" strokeWidth="1" />)
    grid.push(<line key={`h${i}`} x1={padL} y1={gy} x2={W - padR} y2={gy} stroke="#e6ebf5" strokeWidth="1" />)
  }
  const poly = pts.map((p) => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      {grid}
      <line x1={padL} y1={padT} x2={padL} y2={H - padB} stroke={NAVY} strokeWidth="1.8" />
      <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke={NAVY} strokeWidth="1.8" />
      <text x={padL - 5} y={padT + 4} textAnchor="end" fontSize="10" fill="#8893ad">{maxY}</text>
      <text x={padL - 5} y={H - padB} textAnchor="end" fontSize="10" fill="#8893ad">0</text>
      <text x={W - padR} y={H - padB + 14} textAnchor="end" fontSize="10" fill="#8893ad">{maxX}</text>
      <polyline points={poly} fill="none" stroke={TOMATO} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r="4.5" fill={NAVY} stroke="#fff" strokeWidth="1.5" />
      ))}
    </svg>
  )
}

// Ratio bar, e.g. {{ratiobar:2:3|כחול לאדום, יחס 2:3}}. One bar split into equal
// cells colored by group so a ratio a:b (or a:b:c) is visible at a glance.
function RatioBar({ param }) {
  const nums = String(param || '')
    .split(':')
    .map((v) => parseInt(v, 10))
    .filter((v) => Number.isFinite(v) && v > 0)
  if (nums.length < 2) return null
  const colors = [FILL, TOMATO, '#f7d354', '#8bd17c']
  const total = nums.reduce((a, b) => a + b, 0)
  const W = 240
  const H = 44
  const s = W / total
  const cells = []
  let idx = 0
  nums.forEach((count, g) => {
    for (let i = 0; i < count; i++) {
      cells.push(
        <rect key={idx} x={idx * s + 1} y={1} width={s - 2} height={H - 2}
          fill={colors[g % colors.length]} stroke={NAVY} strokeWidth="1.5" rx="3" />
      )
      idx++
    }
  })
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>{cells}</svg>
  )
}

const KINDS = {
  pizza: Pizza,
  circle: CirclePlain,
  bar: Bar,
  'bar-unequal': BarUnequal,
  chocolate: Chocolate,
  numberline: NumberLine,
  grid: Grid,
  rect: Rect,
  parabola: Parabola,
  linegraph: LineGraph,
  ratiobar: RatioBar,
}

export default function FractionArt({ kind, n = 1, d = 4, param, caption }) {
  const Art = KINDS[kind]
  if (!Art) return null
  return (
    <figure className="art-fig">
      <div dir="ltr">
        <Art n={n} d={d} param={param} />
      </div>
      {caption && <figcaption className="art-caption">{caption}</figcaption>}
    </figure>
  )
}
