import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const courseFiles = [
  'courses/geometry-angles-proofs.json',
  'courses/geometry-angles-proofs--part-2.json',
  'courses/geometry-angles-proofs--part-3.json',
]
const allowedArt = new Set(['angle', 'angle-types', 'angles', 'triangle', 'righttriangle', 'quad', 'geoproof'])
const geoproofVariants = new Set(['median', 'altitude', 'bisector', 'sss', 'sas', 'asa', 'isosceles', 'area', 'polygon-area', 'construction', 'exterior'])
const errors = []
const quizQuestions = new Map()

function fail(message) {
  errors.push(message)
}

function words(value) {
  if (typeof value === 'string') return value.trim() ? value.trim().split(/\s+/).length : 0
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + words(item), 0)
  if (value && typeof value === 'object') return Object.entries(value).reduce((sum, [key, item]) => sum + (key === 'metadata' ? 0 : words(item)), 0)
  return 0
}

function inspectText(text, location) {
  if ((text.match(/\$/g) || []).length % 2) fail(`${location}: unbalanced math delimiters`)
  if ((text.match(/\{\{/g) || []).length !== (text.match(/\}\}/g) || []).length) fail(`${location}: unbalanced art token`)
  if (text.includes('@@')) fail(`${location}: leaked PDF placeholder`)
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) fail(`${location}: control character in content`)
  if (/\\{2,}(angle|parallel|cdot|circ|triangle)/.test(text)) fail(`${location}: repeated LaTeX backslash`)
  if (/\\tri\\+angle\b/.test(text)) fail(`${location}: corrupted \\triangle command`)
  if (/\tri\\angle|ABCcong|[A-Z]leftrightarrow|[0-9)]cdot|\frac/.test(text)) fail(`${location}: malformed LaTeX command`)
  if (/\^circ\b/.test(text)) fail(`${location}: missing LaTeX backslash before \\circ`)
  if (/(?<![A-Za-z\\])angle(?=\s*\d|\s*[A-Z])/.test(text)) fail(`${location}: missing LaTeX backslash before \\angle`)
  if (/(?<![A-Za-z\\])parallel\b/.test(text)) fail(`${location}: missing LaTeX backslash before \\parallel`)
  if (/(?<![A-Za-z\\])cdot\b/.test(text)) fail(`${location}: missing LaTeX backslash before \\cdot`)
  for (const match of text.matchAll(/\{\{([^}|:]+)(?::([^}|]+))?\|[^}]+\}\}/g)) {
    const [, kind, param] = match
    if (!allowedArt.has(kind)) fail(`${location}: unknown art kind ${kind}`)
    if (kind === 'geoproof' && !geoproofVariants.has(param)) fail(`${location}: unknown geoproof variant ${param}`)
  }
}

for (const [fileIndex, relative] of courseFiles.entries()) {
  const full = path.join(root, relative)
  const course = JSON.parse(fs.readFileSync(full, 'utf8')).course
  const label = course.metadata.slug
  if (course.metadata.chapters !== course.chapters.length) fail(`${label}: metadata chapter count mismatch`)
  if (course.metadata.course_part?.number !== fileIndex + 1 || course.metadata.course_part?.total !== 3) fail(`${label}: trilogy metadata mismatch`)
  if (course.metadata.include?.includes('diagrams') !== true) fail(`${label}: diagrams must be enabled`)
  const actualWords = words({ learning_objectives: course.learning_objectives, chapters: course.chapters })
  if (course.metadata.word_count !== actualWords) fail(`${label}: word_count ${course.metadata.word_count} != ${actualWords}`)

  for (const [chapterIndex, chapter] of course.chapters.entries()) {
    const chapterLabel = `${label} chapter ${chapterIndex + 1}`
    if (chapter.number !== chapterIndex + 1) fail(`${chapterLabel}: wrong chapter number`)
    if (chapter.content.trim().split(/\s+/).length < 250) fail(`${chapterLabel}: explanation is too thin`)
    if (chapter.examples.length !== 4) fail(`${chapterLabel}: expected 4 examples`)
    if (chapter.exercises.length !== 5) fail(`${chapterLabel}: expected 5 exercises`)
    if (chapter.quiz.length !== 5) fail(`${chapterLabel}: expected exactly 5 quiz questions`)
    inspectText(chapter.content, `${chapterLabel} content`)

    chapter.examples.forEach((example, index) => {
      inspectText(example.content, `${chapterLabel} example ${index + 1}`)
    })
    chapter.exercises.forEach((exercise, index) => {
      if (exercise.number !== index + 1) fail(`${chapterLabel}: exercise numbering`)
      inspectText(`${exercise.description}\n${exercise.solution}`, `${chapterLabel} exercise ${index + 1}`)
    })
    chapter.quiz.forEach((question, index) => {
      if (question.number !== index + 1) fail(`${chapterLabel}: quiz numbering`)
      if (!['multiple-choice', 'true-false', 'open'].includes(question.type)) fail(`${chapterLabel}: invalid quiz type`)
      if (question.type === 'multiple-choice' && (!question.options || !question.options.includes(question.correct_answer))) {
        fail(`${chapterLabel} quiz ${index + 1}: answer is not one of the options`)
      }
      const normalized = question.question.replace(/\s+/g, ' ').trim()
      if (quizQuestions.has(normalized)) fail(`${chapterLabel}: duplicate quiz question also used in ${quizQuestions.get(normalized)}`)
      quizQuestions.set(normalized, chapterLabel)
      inspectText([question.question, ...(question.options || []), question.correct_answer].join('\n'), `${chapterLabel} quiz ${index + 1}`)
    })
  }

  const assetDir = path.join(root, 'courses', 'assets', label)
  const pdfs = fs.existsSync(assetDir) ? fs.readdirSync(assetDir).filter(name => name.toLowerCase().endsWith('.pdf')) : []
  if (!pdfs.length) fail(`${label}: no downloadable PDF`)
  for (const pdf of pdfs) {
    const size = fs.statSync(path.join(assetDir, pdf)).size
    if (size < 50_000) fail(`${label}: PDF ${pdf} is suspiciously small (${size} bytes)`)
  }
  console.log(`OK ${label}: ${course.chapters.length} chapters, ${actualWords} words, ${pdfs.length} PDF`)
}

const artSource = fs.readFileSync(path.join(root, 'frontend', 'src', 'components', 'GeometryProofArt.jsx'), 'utf8')
for (const variant of ['area', 'polygon-area', 'construction', 'exterior']) {
  if (!artSource.includes(`variant === '${variant}'`)) fail(`GeometryProofArt: missing ${variant}`)
}
if (!artSource.includes("width: '100%'") || !artSource.includes('maxWidth: 420')) fail('GeometryProofArt: responsive SVG guard is missing')

if (errors.length) {
  console.error(`\nGeometry audit failed with ${errors.length} issue(s):`)
  errors.forEach(error => console.error(`- ${error}`))
  process.exit(1)
}

console.log('\nGrade-7 geometry audit passed.')
