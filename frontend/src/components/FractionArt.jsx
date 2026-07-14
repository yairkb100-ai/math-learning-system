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

const KINDS = {
  pizza: Pizza,
  circle: CirclePlain,
  bar: Bar,
  'bar-unequal': BarUnequal,
  chocolate: Chocolate,
  numberline: NumberLine,
}

export default function FractionArt({ kind, n = 1, d = 4, caption }) {
  const Art = KINDS[kind]
  if (!Art) return null
  return (
    <figure className="art-fig">
      <div dir="ltr">
        <Art n={n} d={d} />
      </div>
      {caption && <figcaption className="art-caption">{caption}</figcaption>}
    </figure>
  )
}
