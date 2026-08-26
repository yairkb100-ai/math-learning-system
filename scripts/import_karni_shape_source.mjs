import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const [sourceRoot, outputPath] = process.argv.slice(2)
if (!sourceRoot || !outputPath) {
  throw new Error('usage: node scripts/import_karni_shape_source.mjs <source-dir> <output-json>')
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
for (const entry of allFiles) {
  if (!entry.isFile() || !entry.name.endsWith('.html')) continue
  const full = path.join(entry.parentPath || entry.path, entry.name)
  fileMap.set(entry.name, full)
}

const items = []

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
