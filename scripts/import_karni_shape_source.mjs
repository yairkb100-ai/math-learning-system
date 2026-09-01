import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const [sourceRoot, outputPath] = process.argv.slice(2)
if (!sourceRoot || !outputPath) {
  throw new Error('usage: node scripts/import_karni_shape_source.mjs <source-dir> <output-json>')
}

// SVG <pattern> fills ("stripes", "cross-hatch", "dots") in the source files are
// defined once in a page-level <defs> block, not inside each drawing. A single
// extracted <svg> that says fill="url(#pH)" would render empty, so every figure
// and option we emit carries its own copy of the four patterns.
const PATTERN_DEFS =
  '<pattern id="pH" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><line x1="0" y1="4" x2="8" y2="4" stroke="#222" stroke-width="1.6"/></pattern>' +
  '<pattern id="pV" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#fff"/><line x1="4" y1="0" x2="4" y2="8" stroke="#222" stroke-width="1.6"/></pattern>' +
  '<pattern id="pX" width="9" height="9" patternUnits="userSpaceOnUse"><rect width="9" height="9" fill="#fff"/><path d="M-1,1 l3,-3 M0,9 L9,0 M7,11 l3,-3 M-1,8 L8,-1 M9,9 l1,1" stroke="#222" stroke-width="1.3" fill="none"/></pattern>' +
  '<pattern id="pDots" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="10" height="10" fill="#fff"/><circle cx="3" cy="3" r="1.7" fill="#222"/><circle cx="8" cy="8" r="1.7" fill="#222"/></pattern>'

function withPatternDefs(svg) {
  return svg.replace(/(<svg\b[^>]*>)/i, `$1<defs>${PATTERN_DEFS}</defs>`)
}

// Deterministic option shuffle: the authored files always put the correct
// answer first, and a bank whose answer is always index 0 trains nothing.
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledOrder(length, seed) {
  const rand = mulberry32(seed)
  const order = Array.from({ length }, (_, i) => i)
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

const decode = (value) => String(value || '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;/gi, ' ')
  .replace(/&bull;|&#8226;/gi, '•')
  .replace(/&rarr;|&#8594;/gi, '→')
  .replace(/&larr;|&#8592;/gi, '←')
  .replace(/&times;|&#215;/gi, '×')
  .replace(/&deg;|&#176;/gi, '°')
  .replace(/&quot;|&#34;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&amp;/gi, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/\s+/g, ' ')
  .trim()

function classNames(openTag) {
  const match = openTag.match(/\bclass\s*=\s*["']([^"']*)["']/i)
  return new Set((match?.[1] || '').split(/\s+/).filter(Boolean))
}

function elementsByClass(html, tag, wanted) {
  const starts = []
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, 'gi')
  let match
  while ((match = openRe.exec(html))) {
    if (classNames(match[0]).has(wanted)) starts.push({ index: match.index, open: match[0] })
  }
  return starts.map(({ index, open }) => {
    const tokenRe = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi')
    tokenRe.lastIndex = index
    let depth = 0
    let token
    while ((token = tokenRe.exec(html))) {
      depth += token[0].startsWith(`</`) ? -1 : 1
      if (depth === 0) {
        return { html: html.slice(index, tokenRe.lastIndex), index, open }
      }
    }
    throw new Error(`unclosed <${tag}> with class ${wanted}`)
  })
}

function firstClass(html, tag, wanted) {
  return elementsByClass(html, tag, wanted)[0]?.html || ''
}

function svgs(html) {
  return [...html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)].map((m) => m[0])
}

function nestedSvg(svg, x, y, width, height) {
  const inner = svg
    .replace(/^<svg\b([^>]*)>/i, (_, attrs) => {
      const viewBox = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1] || '0 0 100 100'
      return `<svg x="${x}" y="${y}" width="${width}" height="${height}" viewBox="${viewBox}">`
    })
  return inner
}

function composeSvg(parts, columns, missing = 0) {
  const total = parts.length + missing
  const cols = columns || Math.max(1, total)
  const rows = Math.ceil(total / cols)
  const cell = 108
  const rendered = parts.map((svg, i) => nestedSvg(svg, (i % cols) * cell + 4, Math.floor(i / cols) * cell + 4, 100, 100))
  for (let i = parts.length; i < total; i += 1) {
    const x = (i % cols) * cell + 4
    const y = Math.floor(i / cols) * cell + 4
    rendered.push(`<rect x="${x}" y="${y}" width="100" height="100" rx="8" fill="#fff" stroke="#1d3b34" stroke-width="2"/><text x="${x + 50}" y="${y + 66}" text-anchor="middle" font-family="Arial" font-size="46" fill="#1d3b34">?</text>`)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * cell} ${rows * cell}">${rendered.join('')}</svg>`
}

function token(svg) {
  const standalone = /^<svg\b[^>]*\bxmlns=/i.test(svg)
    ? svg
    : svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"')
  return `{{sourcefig:${Buffer.from(standalone).toString('base64')}}}`
}

const configs = [
  ['ravens-matrices.html', 'figural', 'matrix', 'מטריצות', 'מטריצות פרוגרסיביות'],
  ['הצורה-שאינה-שייכת.html', 'figural', 'odd-one-out', 'יוצא דופן צורני', 'הצורה שאינה שייכת'],
  ['השלמת-סדרות.html', 'figural', 'series', 'סדרות צורות', 'השלמת סדרות'],
  ['השוואת-צורות-וספירה.html', 'speed', 'visual-comparison', 'השוואה מהירה', 'השוואת צורות וספירה'],
  ['קיפולים-ורשתות-קובייה.html', 'spatial', 'spatial', 'חשיבה מרחבית', 'קיפולים ורשתות קובייה'],
  ['צללים-ושיקופים.html', 'spatial', 'spatial', 'חשיבה מרחבית', 'צללים ושיקופים'],
  ['מרחב-מבטים-וקוביות.html', 'spatial', 'spatial', 'חשיבה מרחבית', 'מבטים וקוביות'],
]

const allFiles = fs.readdirSync(sourceRoot, { recursive: true, withFileTypes: true })
const fileMap = new Map()
const jsonMap = new Map()
for (const entry of allFiles) {
  if (!entry.isFile()) continue
  const full = path.join(entry.parentPath || entry.path, entry.name)
  if (entry.name.endsWith('.html')) fileMap.set(entry.name, full)
  else if (entry.name.endsWith('.json')) jsonMap.set(entry.name, full)
}

const items = []

// The seven fixed source files (+ matrices-advanced.html) build psy_bank_79.
// A source dir that has none of them is a deliberate "just re-import the
// 100-matrix file" run, not a mistake — skip the 79 rebuild and leave that
// bank as it is on disk. A dir with *some* of them still errors on the gap.
const buildingSeventyNine = configs.some(([fileName]) => fileMap.has(fileName))

if (buildingSeventyNine) {
for (const [fileName, domain, qtype, topic, subtopic] of configs) {
  const fullPath = fileMap.get(fileName)
  if (!fullPath) throw new Error(`missing source file: ${fileName}`)
  const html = fs.readFileSync(fullPath, 'utf8')
  const sections = elementsByClass(html, 'section', 'q')
  sections.forEach((section, idx) => {
    const optionClass = section.html.includes('class="seqopt') ? 'seqopt' : 'opt'
    const options = elementsByClass(section.html, 'div', optionClass)
    if (options.length < 2) throw new Error(`${fileName} question ${idx + 1}: no options`)
    const firstOptionIndex = Math.min(...options.map((o) => o.index))
    const stimulusHtml = section.html.slice(0, firstOptionIndex)
    const stimulusSvgs = svgs(stimulusHtml)
    const missing = /class=["'][^"']*\bmissing\b/i.test(stimulusHtml) || /<span[^>]*>\s*\?\s*<\/span>/i.test(stimulusHtml) ? 1 : 0
    const columns = qtype === 'matrix' ? 3 : stimulusSvgs.length + missing
    const figure = token(composeSvg(stimulusSvgs, columns, missing))
    const optionTokens = options.map((option) => {
      const drawing = svgs(option.html)[0]
      if (drawing) return token(drawing)
      return decode(option.html.replace(/<div\b[^>]*class=["'][^"']*\blbl\b[^"']*["'][^>]*>[\s\S]*$/i, ''))
    })
    let correctIndex = options.findIndex((option) => /class=["'][^"']*\bok\b/i.test(option.html))
    const dataCorrect = section.open.match(/\bdata-correct\s*=\s*["'](\d+)["']/i)
    if (correctIndex < 0 && dataCorrect) correctIndex = Number(dataCorrect[1])
    if (correctIndex < 0 || correctIndex >= options.length) {
      throw new Error(`${fileName} question ${idx + 1}: invalid correct answer ${correctIndex}`)
    }
    const instruction = decode(firstClass(section.html, 'p', 'inst')) || 'בחרו את התשובה הנכונה.'
    const explanation = decode(firstClass(section.html, 'div', 'ans') || firstClass(section.html, 'p', 'expl'))
    const heading = decode((section.html.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i) || [])[1])
    const hard = /קשה|מתקדם/.test(heading)
    const easy = /קל/.test(heading)
    items.push({
      ref: `src-shapes-${String(items.length + 1).padStart(3, '0')}`,
      domain,
      qtype,
      topic,
      subtopic,
      stem: instruction,
      figure,
      options: optionTokens,
      correct_index: correctIndex,
      difficulty: hard ? 4 : easy ? 2 : 3,
      level: hard ? 'advanced' : easy ? 'beginner' : 'standard',
      target_seconds: domain === 'speed' ? 30 : qtype === 'matrix' ? 75 : 55,
      explanation,
      solution: explanation,
      tags: ['מאגר מבחני צורות', subtopic],
      source: `מבחני צורות — ${fileName}`,
    })
  })
}

const advancedPath = fileMap.get('matrices-advanced.html')
if (!advancedPath) throw new Error('missing source file: matrices-advanced.html')
const advancedHtml = fs.readFileSync(advancedPath, 'utf8')
const script = advancedHtml.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1]
if (!script) throw new Error('matrices-advanced.html has no inline script')
const authoredPart = script.split("const app = document.getElementById('app');")[0]
const sandbox = {}
vm.runInNewContext(`${authoredPart}\nglobalThis.__questions = QUESTIONS`, sandbox)
sandbox.__questions.forEach((question) => {
  const cells = question.cells.map((cell) => cell || '')
  const drawings = cells.filter(Boolean)
  const missing = cells.length - drawings.length
  const explanation = decode(question.explain)
  items.push({
    ref: `src-shapes-${String(items.length + 1).padStart(3, '0')}`,
    domain: 'figural',
    qtype: 'matrix',
    topic: 'מטריצות',
    subtopic: 'מטריצות רמה מתקדמת',
    stem: decode(question.title) || 'בחרו את הצורה המשלימה את המטריצה.',
    figure: token(composeSvg(drawings, 3, missing)),
    options: question.options.map(token),
    correct_index: question.correctIndex,
    difficulty: 4,
    level: 'advanced',
    target_seconds: 90,
    explanation,
    solution: explanation,
    tags: ['מאגר מבחני צורות', 'מטריצות מתקדמות'],
    source: 'מבחני צורות — matrices-advanced.html',
  })
})

const result = {
  _comment: 'מאגר קרני מאושר שיובא מתיקיית מבחני צורות. פריטים אלה הם מקור האמת לחלק הצורני בסימולציות.',
  items,
}
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(`wrote ${items.length} items to ${outputPath}`)
} else {
  console.log(`skipped ${path.basename(outputPath)}: none of the fixed מבחני צורות source files are in the source dir`)
}

// ---------------------------------------------------------------------------
// מטריצות-100-תרגילים.html — a second authoring schema.
//
// Unlike the files above (one <section class="q"> per question, or an
// `matrices-advanced.html`-style flat `QUESTIONS` array) this file builds a
// `sections` array of `{ short, title, qs: [...] }`, where every `qs` entry is
//   { cells: string[], opts: string[], ans: number, expl: string,
//     view: {cols?|strip?|big?}, diff: 1..3 }
// `cells` already carries the '?' slot in place, so the grid is composed
// position-aware rather than by appending blanks. It ships with a pre-rendered
// `matrices-content.json` (same shape, SVG strings resolved) which we prefer;
// evaluating the page's authored script is the fallback.
//
// Written to its own bank file so psy_bank_79 — and the test that pins it at
// 94 items — stay untouched.
function loadMatrixHundred() {
  const jsonPath = jsonMap.get('matrices-content.json')
  if (jsonPath) {
    return JSON.parse(fs.readFileSync(jsonPath, 'utf8')).sections
  }
  const htmlPath = fileMap.get('מטריצות-100-תרגילים.html')
  if (!htmlPath) return null
  const raw = fs.readFileSync(htmlPath, 'utf8')
  const inline = raw.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i)?.[1]
  if (!inline) throw new Error('מטריצות-100-תרגילים.html has no inline script')
  const authored = inline.split("if (typeof document !== 'undefined')")[0]
  const sandbox = {}
  vm.runInNewContext(`${authored}\nglobalThis.__sections = sections`, sandbox)
  return sandbox.__sections
}

function composeGridInPlace(cells, cols) {
  const rows = Math.ceil(cells.length / cols)
  const box = 108
  const parts = cells.map((cell, i) => {
    const x = (i % cols) * box + 4
    const y = Math.floor(i / cols) * box + 4
    if (!cell || cell === '?') {
      return (
        `<rect x="${x}" y="${y}" width="100" height="100" rx="8" fill="#eef2fb" stroke="#1d3b34" stroke-width="2"/>` +
        `<text x="${x + 50}" y="${y + 68}" text-anchor="middle" font-family="Arial" font-size="52" font-weight="bold" fill="#7d8db1">?</text>`
      )
    }
    return nestedSvg(cell, x, y, 100, 100)
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols * box} ${rows * box}">${parts.join('')}</svg>`
}

const matrixSections = loadMatrixHundred()
if (!matrixSections) {
  console.log('skipped psy_bank_81: מטריצות-100-תרגילים.html / matrices-content.json not in source dir')
} else {
  const hundred = []
  matrixSections.forEach((section) => {
    section.qs.forEach((q) => {
      const cells = q.cells.map((cell) => cell || '')
      // A 9- or 16-cell stimulus is always a square grid regardless of the
      // page's `view.cols` (the source sets cols:2 on one 3×3 "super-matrix").
      const cols = q.view?.strip
        ? cells.length
        : cells.length === 16
          ? 4
          : cells.length === 9
            ? 3
            : q.view?.cols || 3
      const seed = 0x51ed270b + hundred.length * 0x9e3779b9
      const order = shuffledOrder(q.opts.length, seed)
      const difficulty = q.diff <= 1 ? 2 : q.diff === 2 ? 3 : 4
      hundred.push({
        ref: `src-matrix100-${String(hundred.length + 1).padStart(3, '0')}`,
        domain: 'figural',
        qtype: 'matrix',
        topic: 'מטריצות',
        subtopic: `מטריצות מתקדמות — ${section.short}`,
        stem: q.view?.strip
          ? 'איזו צורה ממשיכה את הרצף?'
          : 'איזו צורה משלימה את המטריצה במקום סימן השאלה?',
        figure: token(withPatternDefs(composeGridInPlace(cells, cols))),
        options: order.map((i) => token(withPatternDefs(q.opts[i]))),
        correct_index: order.indexOf(q.ans),
        difficulty,
        level: difficulty === 2 ? 'beginner' : difficulty === 3 ? 'standard' : 'advanced',
        target_seconds: difficulty === 2 ? 55 : difficulty === 3 ? 75 : 95,
        explanation: decode(q.expl),
        solution: decode(q.expl),
        tags: ['מאגר מבחני צורות', 'מטריצות 100', section.short],
        source: 'מבחני צורות — מטריצות-100-תרגילים.html',
      })
    })
  })
  const hundredPath = path.join(path.dirname(outputPath), 'psy_bank_81_matrices_100.json')
  fs.writeFileSync(
    hundredPath,
    `${JSON.stringify(
      {
        _comment:
          'מאגר קרני — 100 מטריצות פרוגרסיביות מתקדמות, יובא מ-מטריצות-100-תרגילים.html דרך scripts/import_karni_shape_source.mjs. source תואם לגייט "מבחני צורות — %" ולכן הפריטים נשלפים לתרגול, למבחני הצורות ולסימולציות הכלליות.',
        items: hundred,
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
  console.log(`wrote ${hundred.length} items to ${hundredPath}`)
}
