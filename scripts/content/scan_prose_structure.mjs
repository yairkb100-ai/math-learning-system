// Run every authored text field through the REAL lesson renderer
// (frontend/src/components/MathText.jsx) and flag structures that are almost
// always an authoring slip or a renderer misfire.
//
//   node scripts/content/scan_prose_structure.mjs            # courses/*.json
//   node scripts/content/scan_prose_structure.mjs --banks    # practice + קרני banks
//   node scripts/content/scan_prose_structure.mjs --verbose  # print every finding
//   node scripts/content/scan_prose_structure.mjs --only=lettered-single
//
// The renderer is bundled with esbuild (already installed as a Vite
// dependency — run `npm ci` in frontend/ first) and rendered with
// react-dom/server, so what is checked is the markup a student gets, not a
// re-implementation of the parser.
//
// Exit code is always 0: this is a review aid, not a gate. The gate is
// scripts/audit_content.py.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const root = path.resolve(import.meta.dirname, '../..')
const frontend = path.join(root, 'frontend')
const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const banks = args.includes('--banks')
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7)
const NOTE_MAX = 600

// ---- bundle the renderer ---------------------------------------------------
const require = createRequire(path.join(frontend, 'package.json'))
const esbuild = require('esbuild')
const outfile = path.join(os.tmpdir(), `mathtext-scan-${process.pid}.mjs`)
await esbuild.build({
  stdin: {
    resolveDir: frontend,
    loader: 'jsx',
    contents: `
      import React from 'react'
      import { renderToStaticMarkup } from 'react-dom/server'
      import MathText, { InlineMathText, BidiSafeText, parseBlocks } from './src/components/MathText.jsx'
      export { parseBlocks }
      export const block = (text, props) =>
        renderToStaticMarkup(React.createElement(MathText, { text, ...props }))
      export const inline = (text, props) =>
        renderToStaticMarkup(React.createElement(InlineMathText, { text, ...props }))
      export const bidi = (text) =>
        renderToStaticMarkup(React.createElement(BidiSafeText, { text }))
    `,
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  outfile,
  logLevel: 'error',
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
})
const R = await import(pathToFileURL(outfile).href)
fs.rmSync(outfile, { force: true })

// The renderer warns about dropped art tokens; we report those ourselves.
const warnings = []
const origWarn = console.warn
// (KaTeX's "No character metrics" chatter about Hebrew in \text is dropped.)
console.warn = (...a) => {
  if (String(a[0]).startsWith('[MathText]')) warnings.push(a.join(' '))
}

// ---- helpers ---------------------------------------------------------------
const findings = [] // { flag, where, detail }
const add = (flag, where, detail) => findings.push({ flag, where, detail })
const clip = (s, n = 110) => {
  const t = String(s).replace(/\n/g, '⏎')
  return t.length > n ? t.slice(0, n) + '…' : t
}

// Visible text of rendered markup, with KaTeX output and SVG drawings removed
// (both legitimately contain characters we flag in prose).
function visibleText(html) {
  let out = ''
  let i = 0
  const re = /<(\/?)([a-zA-Z0-9]+)([^>]*)>/g
  let skipTag = null
  let depth = 0
  let m
  while ((m = re.exec(html)) !== null) {
    if (!skipTag) out += html.slice(i, m.index)
    i = re.lastIndex
    const [, close, tag, attrs] = m
    const selfClosing = /\/\s*$/.test(attrs)
    if (skipTag) {
      if (tag === skipTag && !selfClosing) depth += close ? -1 : 1
      if (depth === 0) skipTag = null
      continue
    }
    if (!close && !selfClosing) {
      if (tag === 'svg' || (tag === 'span' && /class="math-(?:inline|display)/.test(attrs))) {
        skipTag = tag
        depth = 1
      }
    }
    if (tag === 'br' || tag === 'p' || tag === 'li' || tag === 'div') out += '\n'
  }
  if (!skipTag) out += html.slice(i)
  return out
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
}

const MARKS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ']

// Checks on the source string, whatever renders it.
function checkSource(src, where) {
  if (/&(?:[a-zA-Z]{2,8}|#\d{2,5}|#x[0-9a-fA-F]{2,5});/.test(src)) add('html-entity', where, clip(src.match(/.{0,30}&(?:[a-zA-Z]{2,8}|#\d+|#x[0-9a-fA-F]+);.{0,30}/s)[0]))
  if (/[‎‏‪-‮⁦-⁩]/.test(src)) add('bidi-control-char', where, clip(src.match(/.{0,30}[‎‏‪-‮⁦-⁩].{0,30}/s)[0]))
  if (/ /.test(src)) add('nbsp-char', where, clip(src.match(/.{0,30} .{0,30}/s)[0]))
  // unbalanced math delimiters
  const noEsc = src.replace(/\\\$/g, '')
  const dd = (noEsc.match(/\$\$/g) || []).length
  if (dd % 2) add('display-math-unclosed', where, clip(src))
  const single = (noEsc.replace(/\$\$/g, '').match(/\$/g) || []).length
  if (single % 2) add('inline-math-unclosed', where, clip(src))
  // "%" inside math is a TeX comment
  for (const m of noEsc.matchAll(/\$\$([^$]*)\$\$|\$([^$]+)\$/g)) {
    const body = m[1] ?? m[2]
    if (/(?<!\\)%/.test(body)) add('percent-in-math', where, clip(m[0]))
  }
  // a display formula that the block parser will NOT lift (text on its line)
  for (const line of src.split('\n')) {
    if (/^[\s.,:;!?\-–—*_>·•]+$/.test(line)) add('punctuation-only-line', where, clip(line))
  }
}

// Checks on rendered markup.
function checkRendered(html, where, src) {
  if (html.includes('katex-error')) {
    const m = html.match(/katex-error" title="([^"]*)"/)
    add('katex-error', where, clip(m ? m[1] : src))
  }
  const text = visibleText(html)
  if (text.includes('**')) add('raw-bold-leak', where, clip(text.match(/.{0,40}\*\*.{0,40}/s)[0]))
  else if (/(^|[\s(])\*[^\s*][^*\n]*\*/.test(text)) add('raw-star-leak', where, clip(text.match(/.{0,40}\*[^\s*][^*\n]*\*.{0,20}/s)[0]))
  if (text.includes('$')) add('raw-dollar-leak', where, clip(text.match(/.{0,40}\$.{0,40}/s)[0]))
  if (/\{\{|\}\}/.test(text)) add('raw-art-token-leak', where, clip(text.match(/.{0,40}(?:\{\{|\}\}).{0,40}/s)[0]))
  if (/\\[a-zA-Z]{2,}/.test(text)) add('raw-latex-leak', where, clip(text.match(/.{0,40}\\[a-zA-Z]{2,}.{0,40}/s)[0]))
  if (/^#{1,6}\s/m.test(text)) add('raw-heading-leak', where, clip(text.match(/^#{1,6}\s.*$/m)[0]))
  if (/^\s*\|.*\|\s*$/m.test(text)) add('raw-table-leak', where, clip(text.match(/^\s*\|.*\|\s*$/m)[0]))
}

// Structural checks on the block parser's output (block-rendered fields).
function checkBlocks(src, where) {
  const blocks = R.parseBlocks(src)
  blocks.forEach((b, i) => {
    const next = blocks[i + 1]
    if (b.type === 'lettered') {
      const marks = b.items.map((it) => it.mark)
      if (b.items.length === 1) add('lettered-single', where, clip(`${marks[0]}. ${b.items[0].text}`))
      b.items.forEach((it) => {
        if (!it.text.trim()) add('lettered-empty-item', where, `${it.mark}.`)
      })
      const idx = marks.map((mk) => MARKS.indexOf(mk))
      if (idx.some((x) => x < 0)) add('lettered-not-a-letter', where, clip(marks.join(' ') + ' | ' + b.items[idx.findIndex((x) => x < 0)].text))
      else if (b.items.length > 1 && idx.some((x, j) => j > 0 && x !== idx[j - 1] + 1)) add('lettered-out-of-order', where, marks.join(' '))
    }
    if (b.type === 'step' && !b.text.trim()) add('step-empty', where, `${b.word} ${b.num}`)
    if (b.type === 'label') {
      if (!next || next.type === 'heading' || next.type === 'label') add('label-dangling', where, clip(b.text))
    }
    if (b.type === 'paragraph' && b.note && b.text.length > NOTE_MAX) add('note-long', where, `${b.text.length} chars: ${clip(b.text, 60)}`)
    if (b.type === 'ol' && b.items.length === 1) add('numbered-single', where, clip(b.items[0]))
    if (b.type === 'ul' && b.items.some((x) => !x.trim())) add('bullet-empty', where, '')
    if (b.type === 'table') {
      const w = b.header.length
      if (b.rows.some((r) => r.length !== w)) add('table-ragged', where, clip(b.header.join(' | ')))
    }
  })
  return blocks
}

function scanBlock(src, where, props) {
  if (src == null || src === '') return []
  src = String(src)
  checkSource(src, where)
  const blocks = checkBlocks(src, where)
  const before = warnings.length
  checkRendered(R.block(src, props), where, src)
  if (warnings.length > before) add('art-token-dropped', where, clip(warnings[warnings.length - 1], 160))
  return blocks
}
function scanInline(src, where, props) {
  if (src == null || src === '') return
  src = String(src)
  checkSource(src, where)
  if (src.includes('\n')) add('newline-in-inline-field', where, clip(src))
  const before = warnings.length
  checkRendered(R.inline(src, props), where, src)
  if (warnings.length > before) add('art-token-dropped', where, clip(warnings[warnings.length - 1], 160))
}

// ---- courses ---------------------------------------------------------------
function scanCourses() {
  const dir = path.join(root, 'courses')
  let chapters = 0
  let fields = 0
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const course = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')).course
    const slug = file.replace(/\.json$/, '')
    for (const ch of course.chapters || []) {
      chapters++
      const at = (f) => `${slug} ch${ch.number} ${f}`
      scanInline(ch.title, at('title')); fields++
      ;(ch.learning_objectives || []).forEach((o, i) => { scanInline(o, at(`objective[${i}]`)); fields++ })
      scanBlock(ch.content, at('content'), { className: 'prose' }); fields++
      ;(ch.examples || []).forEach((e, i) => {
        scanInline(e.title, at(`example[${i}].title`))
        scanBlock(e.content, at(`example[${i}].content`)); fields += 2
      })
      ;(ch.exercises || []).forEach((e, i) => {
        scanInline(e.title, at(`exercise[${i}].title`))
        scanBlock(e.description, at(`exercise[${i}].description`))
        scanBlock(e.solution, at(`exercise[${i}].solution`)); fields += 3
      })
      ;(ch.quiz || []).forEach((q, i) => {
        scanBlock(q.question, at(`quiz[${i}].question`))
        ;(q.options || []).forEach((o, j) => {
          // Quiz.jsx: block path only when the option carries an art token.
          if (/\{\{/.test(String(o))) scanBlock(o, at(`quiz[${i}].option[${j}]`))
          else scanInline(o, at(`quiz[${i}].option[${j}]`), { mathRuns: true })
        })
        scanBlock(q.explanation, at(`quiz[${i}].explanation`)); fields += 2
      })
      ;(ch.interactive || []).forEach((a, i) => {
        scanInline(a.title, at(`interactive[${i}].title`))
        scanBlock(a.prompt, at(`interactive[${i}].prompt`))
        scanInline(a.explanation, at(`interactive[${i}].explanation`))
        for (const key of ['zones', 'items', 'distractors', 'parts']) {
          ;(a[key] || []).forEach((x, j) => {
            scanInline(x.label ?? x.text, at(`interactive[${i}].${key}[${j}]`))
          })
        }
        fields += 3
      })
    }
  }
  return `${chapters} chapters, ~${fields} block/inline fields`
}

// ---- practice + קרני banks (non-lesson surfaces) ----------------------------
// Here ANY block structure beyond a plain paragraph is worth a look: these
// texts are shown in compact cards and option buttons.
function scanBanks() {
  const dir = path.join(root, 'backend', 'data')
  let n = 0
  const structure = (blocks, where) => {
    for (const b of blocks) {
      if (b.type === 'paragraph' && !b.note) {
        if (b.text.includes('\n')) add('surface:line-break', where, clip(b.text))
        continue
      }
      if (b.type === 'art') continue
      add(`surface:${b.type === 'paragraph' ? 'note-' + b.note : b.type}`, where, clip(b.text ?? (b.items || []).map((x) => x.text ?? x).join(' / ')))
    }
  }
  for (const file of fs.readdirSync(dir).filter((f) => /^practice_.*\.json$/.test(f)).sort()) {
    const list = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    list.forEach((q, i) => {
      n++
      const at = (f) => `${file}#${i} ${f}`
      structure(scanBlock(q.question, at('question')), at('question')) // Practice.jsx / ExamPlayer.jsx
      scanInline(q.question, at('question(inline)')) // ExamResults / practice summary
      scanInline(q.explanation, at('explanation'))
      ;(q.options || []).forEach((o, j) => {
        checkSource(String(o), at(`option[${j}]`))
      })
    })
  }
  for (const file of fs.readdirSync(dir).filter((f) => /^psy_bank_.*\.json$/.test(f)).sort()) {
    const bank = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
    ;(bank.passages || []).forEach((p) => {
      const at = (f) => `${file} passage:${p.slug} ${f}`
      structure(scanBlock(p.body, at('body')), at('body'))
      if (p.figure) scanBlock(p.figure, at('figure'))
    })
    ;(bank.items || []).forEach((it) => {
      n++
      const at = (f) => `${file} ${it.ref} ${f}`
      structure(scanBlock(it.stem, at('stem'), { mathRuns: true }), at('stem'))
      if (it.figure) scanBlock(it.figure, at('figure'))
      ;(it.options || []).forEach((o, j) => structure(scanBlock(o, at(`option[${j}]`), { mathRuns: true }), at(`option[${j}]`)))
      structure(scanBlock(it.explanation, at('explanation')), at('explanation'))
      structure(scanBlock(it.solution, at('solution')), at('solution'))
    })
  }
  return `${n} bank items`
}

const scope = banks ? scanBanks() : scanCourses()
console.warn = origWarn

// ---- report ----------------------------------------------------------------
const shown = only ? findings.filter((f) => f.flag === only) : findings
const counts = {}
for (const f of shown) counts[f.flag] = (counts[f.flag] || 0) + 1
console.log(`Scanned ${scope}.`)
if (!shown.length) console.log('No findings.')
for (const flag of Object.keys(counts).sort()) {
  console.log(`\n${flag}: ${counts[flag]}`)
  const list = shown.filter((f) => f.flag === flag)
  for (const f of verbose || only ? list : list.slice(0, 6)) console.log(`  ${f.where}  ::  ${f.detail}`)
  if (!(verbose || only) && list.length > 6) console.log(`  … ${list.length - 6} more (--only=${flag})`)
}
