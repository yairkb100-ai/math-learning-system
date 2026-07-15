import { useMemo } from 'react'
import katex from 'katex'
import FractionArt from './FractionArt.jsx'

// Lightweight Markdown + LaTeX renderer for course content.
// Handles: ## / ### headings, **bold**, bullet/numbered lists, tables,
// and inline `$...$` / display `$$...$$` math. Non-math/markdown text is kept
// as plain (escaped) React text; only KaTeX output uses dangerouslySetInnerHTML.

// ---- inline: math ($$…$$, $…$) + **bold** ---------------------------------
function renderInline(text, keyPrefix) {
  const nodes = []
  let k = 0

  // Split on display math first so $$…$$ stays intact.
  const displayParts = stripUnknownArtTokens(String(text)).split(/(\$\$[^$]*\$\$)/g)
  displayParts.forEach((part) => {
    if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
      nodes.push(renderMath(part.slice(2, -2), true, `${keyPrefix}-${k++}`, part))
      return
    }
    // Then inline math $…$.
    const inlineParts = part.split(/(\$[^$]+\$)/g)
    inlineParts.forEach((p) => {
      if (p.startsWith('$') && p.endsWith('$') && p.length >= 2) {
        nodes.push(renderMath(p.slice(1, -1), false, `${keyPrefix}-${k++}`, p))
      } else if (p) {
        // Finally **bold** within the remaining plain text.
        p.split(/(\*\*[^*]+\*\*)/g).forEach((seg) => {
          if (!seg) return
          if (seg.startsWith('**') && seg.endsWith('**') && seg.length >= 4) {
            nodes.push(<strong key={`${keyPrefix}-${k++}`}>{seg.slice(2, -2)}</strong>)
          } else {
            nodes.push(<span key={`${keyPrefix}-${k++}`}>{seg}</span>)
          }
        })
      }
    })
  })
  return nodes
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
export function InlineMathText({ text }) {
  return <>{renderInline(String(text || ''), 'im')}</>
}

// ---- illustrations: {{kind:param|caption}} ---------------------------------
// A line made only of art tokens becomes a row of friendly SVG figures.
// `param` is kind-specific: most kinds use "n/d" (a fraction), some use a bare
// number, and a few (grid, rect) use their own "RxC/n" / "WxH" grammar — see
// FractionArt.jsx for how each kind interprets it.
const ART_TOKEN = /\{\{([a-z-]+)(?::([^|}]+))?(?:\|([^}]*))?\}\}/g
// Anything left over that still *looks* like an unparsed art token — used to
// avoid leaking raw "{{...}}" syntax into the page when authoring goes wrong.
const ART_TOKEN_SHAPED = /\{\{[a-z-]+(?::[^|}]+)?(?:\|[^}]*)?\}\}/

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
    items.push({ kind: m[1], n, d, param, caption: m[4] || null })
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

export default function MathText({ text, className }) {
  const blocks = useMemo(() => parseBlocks(String(text || '')), [text])

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const key = `b-${i}`
        if (block.type === 'heading') {
          const H = block.level >= 3 ? 'h4' : 'h3'
          return <H key={key} className="prose-h">{renderInline(block.text, key)}</H>
        }
        if (block.type === 'ul') {
          return (
            <ul key={key} className="prose-list">
              {block.items.map((it, j) => (
                <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'ol') {
          return (
            <ol key={key} className="prose-list">
              {block.items.map((it, j) => (
                <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
              ))}
            </ol>
          )
        }
        if (block.type === 'art') {
          return (
            <div key={key} className="art-row">
              {block.items.map((it, j) => (
                <FractionArt key={j} {...it} />
              ))}
            </div>
          )
        }
        if (block.type === 'table') {
          return (
            <div key={key} className="prose-table-wrap">
              <table className="prose-table">
                <thead>
                  <tr>
                    {block.header.map((c, j) => (
                      <th key={j}>{renderInline(c, `${key}-h-${j}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((c, j) => (
                        <td key={j}>{renderInline(c, `${key}-${r}-${j}`)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        // paragraph
        return <p key={key} className="prose-p">{renderInline(block.text, key)}</p>
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
