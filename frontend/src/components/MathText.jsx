import { useMemo } from 'react'
import katex from 'katex'
import FractionArt from './FractionArt.jsx'

// Lightweight Markdown + LaTeX renderer for course content.
// Handles: ## / ### headings, **bold**, bullet/numbered lists, tables,
// and inline `$...$` / display `$$...$$` math. Non-math/markdown text is kept
// as plain (escaped) React text; only KaTeX output uses dangerouslySetInnerHTML.

// ---- inline: math ($$…$$, $…$) + **bold** ---------------------------------
// `opts.mathRuns` keeps every run of LTR math (a number sequence, an
// expression) on one line and bidi-isolated — see mathRunNodes below. It is
// opt-in because course prose may hold expressions too long to fit unbroken;
// the קרני exam surfaces switch it on, where a sequence that wraps mid-run is
// a defect.
function renderInline(text, keyPrefix, opts) {
  const nodes = []
  let k = 0

  // Split on display math first so $$…$$ stays intact.
  const displayParts = stripUnknownArtTokens(String(text)).split(/(\$\$[^$]*\$\$)/g)
  displayParts.forEach((part) => {
    if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
      nodes.push(renderMath(part.slice(2, -2), true, `${keyPrefix}-${k++}`, part))
      return
    }
    // Then **bold** — BEFORE inline math, so bold spans that contain $…$
    // (e.g. "**שימו לב: $2x=10$**") stay bold instead of leaking raw
    // asterisks. [^*] deliberately allows $ inside the bold span.
    part.split(/(\*\*[^*]+\*\*)/g).forEach((seg) => {
      if (!seg) return
      if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) {
        nodes.push(
          <strong key={`${keyPrefix}-${k++}`}>
            {renderInlineMath(seg.slice(2, -2), `${keyPrefix}-b${k}`, opts)}
          </strong>
        )
      } else {
        nodes.push(...renderInlineMath(seg, `${keyPrefix}-${k++}`, opts))
      }
    })
  })
  return nodes
}

// Inline math ($…$) within a plain-text segment → array of nodes.
function renderInlineMath(text, keyPrefix, opts) {
  const out = []
  let k = 0
  String(text)
    .split(/(\$[^$]+\$)/g)
    .forEach((p) => {
      if (p.startsWith('$') && p.endsWith('$') && p.length >= 2) {
        out.push(renderMath(p.slice(1, -1), false, `${keyPrefix}-${k++}`, p))
      } else if (p) {
        out.push(
          <span key={`${keyPrefix}-${k++}`}>
            {opts?.mathRuns ? unbreakableRuns(p, `${keyPrefix}-r${k}`) : p}
          </span>
        )
      }
    })
  return out
}

function renderMath(value, display, key, raw) {
  let html
  try {
    html = katex.renderToString(value, { displayMode: display, throwOnError: false })
  } catch {
    return <span key={key}>{raw}</span>
  }
  return (
    <span
      key={key}
      className={display ? 'math-display' : 'math-inline'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// Inline-only variant for short strings (list items, titles) — no block wrapping.
export function InlineMathText({ text, mathRuns }) {
  return <>{renderInline(String(text || ''), 'im', { mathRuns })}</>
}

// True when a block of prose is essentially all-Latin (an English reading
// passage, e.g.) rather than Hebrew with the occasional English word. The
// page as a whole stays RTL, but a full English paragraph inheriting that
// container direction renders right-aligned — readable (the bidi algorithm
// still orders the Latin words left-to-right within a line), just visually
// backwards for a native English layout. Callers use this to opt a specific
// block into `direction: ltr; text-align: left` without flipping the
// surrounding Hebrew UI.
const HEBREW_LETTER = /[֐-׿]/
export function isLatinText(text) {
  const letters = String(text || '').match(/[A-Za-zא-ת]/g)
  if (!letters || !letters.length) return false
  const hebrewCount = letters.filter((ch) => HEBREW_LETTER.test(ch)).length
  return hebrewCount / letters.length < 0.05
}

// ---- bidi-safe plain text (display only, never rewrites the string) --------
// For strings that are COMPARED, not authored: quiz/exam/practice option
// labels and the stored correct answer. Those are graded — the chosen string is
// matched against the stored one — so they must not go through KaTeX, which
// would replace the text the student sees with re-typeset markup.
//
// Instead we leave every character exactly as it is and only wrap each run of
// LTR math (digits/latin/superscripts plus the neutral chars between them) in a
// bidi-isolating span. Unicode bidi rule N1 otherwise resolves those neutrals
// (parens, "=", "·", "/") to RTL inside a Hebrew line, which flips
// "(2²)³ = 64" into fragments laid out right-to-left. Hebrew runs are emitted
// untouched, and the concatenated text content is identical to the input.

// A "strong" LTR character: latin letters, digits, super/subscript digits.
const IS_LTR_STRONG = /[0-9A-Za-z²³¹⁰⁴-⁹₀-₉]/
// Direction-neutral characters that may sit *between* two strong ones. These
// are exactly the ones bidi rule N1 hands to the surrounding RTL context.
const IS_NEUTRAL =
  /[\s()[\]{}+\-*/\\^,.:;'"<>%=−–·×÷≤≥≠≈±°→√π]/
// Only runs that actually look like math get isolated — a bare counting number
// or a lone latin word inside Hebrew prose is left alone, so "4 בלוקים" and
// "שאלה 3" keep their natural flow.
const MATH_SHAPED =
  /[()[\]{}+\-*/^<>=−–·×÷≤≥≠≈±→√²³¹⁰⁴-⁹₀-₉]/

// Brackets and signs that belong to the expression even when they sit at its
// very edge: "(2²)³" must isolate together with its opening parenthesis, or the
// lone "(" resolves RTL and drifts to the far side of the expression.
const EDGE_NEUTRAL = /[()[\]{}+\-−–]/

// Find the LTR runs in `src`: each starts and ends on a strong character (then
// grows over any edge brackets/signs) and may span neutrals in between.
// Returns [start, end) index pairs.
function ltrRuns(src) {
  const runs = []
  let i = 0
  while (i < src.length) {
    if (!IS_LTR_STRONG.test(src[i])) {
      i++
      continue
    }
    let start = i
    let end = i + 1 // one past the last STRONG char seen
    let j = i + 1
    while (j < src.length && (IS_LTR_STRONG.test(src[j]) || IS_NEUTRAL.test(src[j]))) {
      if (IS_LTR_STRONG.test(src[j])) end = j + 1
      j++
    }
    while (start > 0 && EDGE_NEUTRAL.test(src[start - 1])) start--
    while (end < src.length && EDGE_NEUTRAL.test(src[end])) end++
    runs.push([start, end])
    i = end
  }
  return runs
}

// Wrap every math-shaped LTR run of `src` in a bidi-isolating span and leave
// all other characters untouched, so the concatenated text is identical to the
// input. Returns the bare string when there is nothing to isolate.
export function mathRunNodes(src, keyPrefix = 'bs', className = 'bidi-math') {
  const nodes = []
  let last = 0
  let k = 0
  for (const [start, end] of ltrRuns(src)) {
    const run = src.slice(start, end)
    if (!MATH_SHAPED.test(run)) continue
    if (start > last) nodes.push(src.slice(last, start))
    nodes.push(
      <span key={`${keyPrefix}-${k++}`} className={className}>
        {run}
      </span>
    )
    last = end
  }
  if (!nodes.length) return src
  if (last < src.length) nodes.push(src.slice(last))
  return nodes
}

export function BidiSafeText({ text }) {
  return <>{mathRunNodes(String(text ?? ''))}</>
}

// ---- unbreakable runs (קרני exams) ----------------------------------------
// A sequence question is read as one row: "100, 5, 90, 10, 80, 15, 70, ?" that
// wraps after "80, 15" reads as two sequences and the חוקיות disappears. So on
// the exam surfaces every comma-separated run — numbers OR Hebrew letters,
// including the trailing "?" — is kept on one line, and any remaining LTR math
// run is isolated and kept whole too.
//
// An "atom" is one member of such a run: a number, a single letter, or the
// question mark that stands for the missing member.
const SEQ_ATOM = String.raw`(?:-?\d+(?:\.\d+)?|[A-Za-zא-ת]|\?)`
// Three atoms minimum, so an ordinary Hebrew sentence with one comma in it is
// never mistaken for a sequence.
const SEQUENCE_RE = new RegExp(
  SEQ_ATOM + String.raw`(?:\s*,\s*` + SEQ_ATOM + `){2,}`, 'g')
// Digits/latin inside the run mean it must also be bidi-isolated; a run of
// Hebrew letters is RTL already and only needs the no-break.
const HAS_LTR = /[0-9A-Za-z]/

export function unbreakableRuns(src, keyPrefix = 'ub') {
  const nodes = []
  let last = 0
  let k = 0
  SEQUENCE_RE.lastIndex = 0
  let m
  const push = (chunk) => {
    if (!chunk) return
    const inner = mathRunNodes(chunk, `${keyPrefix}-m${k++}`, 'bidi-math nowrap-run')
    if (Array.isArray(inner)) nodes.push(...inner)
    else nodes.push(inner)
  }
  while ((m = SEQUENCE_RE.exec(src)) !== null) {
    push(src.slice(last, m.index))
    nodes.push(
      <span
        key={`${keyPrefix}-s${k++}`}
        className={HAS_LTR.test(m[0]) ? 'bidi-math nowrap-run' : 'nowrap-run'}
      >
        {m[0]}
      </span>
    )
    last = m.index + m[0].length
  }
  if (!nodes.length) {
    const only = mathRunNodes(src, `${keyPrefix}-m${k}`, 'bidi-math nowrap-run')
    return only
  }
  push(src.slice(last))
  return nodes
}

// ---- illustrations: {{kind:param|caption}} ---------------------------------
// A line made only of art tokens becomes a row of friendly SVG figures.
// `param` is kind-specific: most kinds use "n/d" (a fraction), some use a bare
// number, and a few (grid, rect) use their own "RxC/n" / "WxH" grammar — see
// FractionArt.jsx for how each kind interprets it.
// The caption may itself contain braces — it is rendered through `renderInline`
// and so routinely holds LaTeX like "$\frac{2}{3}$". It therefore matches any
// run of characters up to the closing "}}", allowing a lone "}" through.
const CAPTION = String.raw`(?:[^}]|\}(?!\}))*`
const ART_TOKEN = new RegExp(
  String.raw`\{\{([a-z-]+)(?::([^|}]+))?(?:\|(${CAPTION}))?\}\}`, 'g')
// Anything left over that still *looks* like an unparsed art token — used to
// avoid leaking raw "{{...}}" syntax into the page when authoring goes wrong.
const ART_TOKEN_SHAPED = new RegExp(
  String.raw`\{\{[a-z-]+(?::[^|}]+)?(?:\|${CAPTION})?\}\}`)

function parseArtLine(line) {
  const items = []
  let rest = line
  let m
  ART_TOKEN.lastIndex = 0
  while ((m = ART_TOKEN.exec(line)) !== null) {
    const param = m[2]
    let n, d
    if (param != null) {
      const frac = param.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/)
      if (frac) {
        n = Number(frac[1])
        d = Number(frac[2])
      } else if (/^\d+(?:\.\d+)?$/.test(param)) {
        d = Number(param)
      }
    }
    items.push({ kind: m[1], n, d, param, caption: m[3] || null })
    rest = rest.replace(m[0], '')
  }
  if (items.length === 0 || rest.trim() !== '') return null
  return items
}

// Strip any leftover "{{...}}"-shaped text a paragraph might contain (e.g. an
// authoring typo that didn't parse as a standalone art line) instead of
// showing broken raw syntax to the reader.
function stripUnknownArtTokens(text) {
  if (!ART_TOKEN_SHAPED.test(text)) return text
  console.warn('[MathText] dropping unrecognized art token(s) in:', text)
  return text.replace(new RegExp(ART_TOKEN_SHAPED, 'g'), '').replace(/\s{2,}/g, ' ').trim()
}

// ---- block-level parsing --------------------------------------------------
function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line)
}
function isTableSep(line) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line)
}
function splitRow(line) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

export default function MathText({ text, className, mathRuns }) {
  const blocks = useMemo(() => parseBlocks(String(text || '')), [text])
  const opts = useMemo(() => ({ mathRuns }), [mathRuns])

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const key = `b-${i}`
        if (block.type === 'heading') {
          const H = block.level >= 3 ? 'h4' : 'h3'
          return <H key={key} className="prose-h">{renderInline(block.text, key, opts)}</H>
        }
        if (block.type === 'ul') {
          return (
            <ul key={key} className="prose-list">
              {block.items.map((it, j) => (
                <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`, opts)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={key} className="prose-list">
              {block.items.map((it, j) => (
                <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`, opts)}</li>
              ))}
            </ol>
          )
        }
        if (block.type === 'art') {
          return (
            <div key={key} className="art-row">
              {block.items.map((it, j) => (
                // The caption is authored like any other prose, so it goes
                // through renderInline — otherwise "$3 \times 4$" reaches the
                // reader as literal dollar signs, and a bare < in it flips.
                <FractionArt
                  key={j}
                  {...it}
                  caption={
                    it.caption ? renderInline(it.caption, `${key}-${j}-cap`, opts) : null
                  }
                />
              ))}
            </div>
          )
        }
        if (block.type === 'quote') {
          return (
            <blockquote key={key} className="prose-quote">
              {renderInline(block.text, key, opts)}
            </blockquote>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={key} className="prose-table-wrap">
              <table className="prose-table">
                <thead>
                  <tr>
                    {block.header.map((c, j) => (
                      <th key={j}>{renderInline(c, `${key}-h-${j}`, opts)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((c, j) => (
                        <td key={j}>{renderInline(c, `${key}-${r}-${j}`, opts)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        // paragraph
        return <p key={key} className="prose-p">{renderInline(block.text, key, opts)}</p>
      })}
    </div>
  )
}

function parseBlocks(text) {
  const lines = text.split('\n')
  const blocks = []
  let i = 0
  let para = []

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: 'paragraph', text: para.join(' ') })
      para = []
    }
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushPara()
      i++
      continue
    }

    // illustration row: {{pizza:3/4|caption}} {{bar:1/2}}
    const art = parseArtLine(trimmed)
    if (art) {
      flushPara()
      blocks.push({ type: 'art', items: art })
      i++
      continue
    }

    // heading: ## text  /  ### text
    const h = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      flushPara()
      blocks.push({ type: 'heading', level: h[1].length, text: h[2] })
      i++
      continue
    }

    // table: current line and next are pipe rows, next is a separator
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flushPara()
      const header = splitRow(line)
      const rows = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', header, rows })
      continue
    }

    // callout ("> ..."): a highlighted aside — a rule of thumb, or the word
    // problem a section is about. Without this the "> " fell through to a
    // plain paragraph, where the marker rendered literally and BiDi pushed it
    // to the wrong end of the Hebrew line.
    if (/^\s*>\s+/.test(line)) {
      flushPara()
      const items = []
      while (i < lines.length && /^\s*>\s*/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      blocks.push({ type: 'quote', text: items.join(' ').trim() })
      continue
    }

    // bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      flushPara()
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''))
        i++
      }
      blocks.push({ type: 'ul', items })
      continue
    }

    // numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara()
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''))
        i++
      }
      blocks.push({ type: 'ol', items })
      continue
    }

    // plain text — accumulate into paragraph
    para.push(trimmed)
    i++
  }
  flushPara()
  return blocks
}
