// Builds the data behind the public (crawlable) layer from courses/*.json.
//
// Two outputs, both served as static JSON rather than bundled into the app:
//   frontend/public/data/catalog.json      — courses, chapter titles and
//       one-line summaries. Drives every index/hub page.
//   frontend/public/data/topics/<slug>.json — the per-chapter teaser blocks
//       for one course, plus everything its topic pages need for breadcrumbs
//       and sibling links.
// A page fetches only the file it needs, and the prerenderer inlines that
// same JSON into the static HTML — so a logged-in student never downloads a
// byte of it, and a crawler never has to wait for a second request.
//
// Run via `npm run build` in frontend/ (prebuild) or directly:
//   node scripts/seo/build_catalog.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COURSE_GRADES, PUBLIC_SLUG_ALIASES, GRADES, SUBJECTS, KARNI_AREAS } from './taxonomy.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const COURSES_DIR = path.join(ROOT, 'courses')
const DATA_OUT_DIR = path.join(ROOT, 'frontend', 'public', 'data')
const CATALOG_OUT = path.join(DATA_OUT_DIR, 'catalog.json')
const TOPICS_OUT_DIR = path.join(DATA_OUT_DIR, 'topics')
// מודול קטן שנכנס ל-bundle עצמו (ולא ל-/data), כי דף הנחיתה מציג את המספרים
// האלה בהירו — ואסור שהם יעלו fetch של קטלוג בן ~150KB או שייעלמו בניווט
// פנימי אל "/" שבו הקטלוג לא הוזרק לעמוד.
const STATS_OUT = path.join(ROOT, 'frontend', 'src', 'lib', 'catalogStats.js')

// How much of a chapter goes public. The lesson itself stays behind login —
// what ships here is the opening explanation, enough to be a genuinely useful
// page on its own and enough for Google to see a real article rather than a
// stub. Raising this hands more of the paid product away for free.
const TEASER_CHARS = 1100
const TEASER_MAX_BLOCKS = 7

// ---------------------------------------------------------------- helpers

/** Plain, human-readable text from the course markdown (for meta/description). */
function toPlainText(md) {
  return md
    .replace(/\{\{[^}]*\}\}/g, ' ') // art tokens
    .replace(/\$\$([^$]*)\$\$/g, ' ')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[$*_`#>|]/g, '')
    .replace(/\\\\/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncate(text, max) {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

/**
 * The public teaser: the chapter's opening blocks, up to TEASER_CHARS of
 * prose. Art tokens are dropped (their SVGs live in the app), everything
 * else keeps its markdown so MathText renders $…$ the same way it does
 * inside the lesson.
 */
function buildTeaser(content) {
  const blocks = []
  let budget = TEASER_CHARS
  for (const raw of String(content || '').split(/\n{2,}/)) {
    const block = raw.trim()
    if (!block) continue
    if (/^\{\{.*\}\}$/s.test(block)) continue // stand-alone illustration
    if (/^\|/.test(block)) continue // markdown table — needs the app's styling
    if (/^#{1,6}\s/.test(block)) {
      if (blocks.length >= TEASER_MAX_BLOCKS) break
      blocks.push({ type: 'h', text: block.replace(/^#{1,6}\s+/, '').trim() })
      continue
    }
    const clean = block.replace(/\{\{[^}]*\}\}/g, '').trim()
    if (!clean) continue
    const isMath = /^\$\$[\s\S]*\$\$$/.test(clean)
    blocks.push({ type: isMath ? 'math' : 'p', text: clean })
    if (!isMath) budget -= toPlainText(clean).length
    if (budget <= 0 || blocks.length >= TEASER_MAX_BLOCKS) break
  }
  // Never end on a heading — a title with nothing under it reads as broken.
  while (blocks.length && blocks[blocks.length - 1].type === 'h') blocks.pop()
  // Back to markdown: the public pages render it with the very same MathText
  // component the lesson uses, so $…$ and headings look identical inside and
  // outside the paywall.
  return blocks.map((b) => (b.type === 'h' ? `## ${b.text}` : b.text)).join('\n\n')
}

function firstParagraph(content) {
  for (const raw of String(content || '').split(/\n{2,}/)) {
    const block = raw.trim()
    if (!block || /^#{1,6}\s/.test(block) || /^\{\{/.test(block) || /^\|/.test(block)) continue
    const plain = toPlainText(block)
    if (plain.length > 40) return plain
  }
  return ''
}

function baseCourseSlug(slug) {
  return String(slug).replace(/--part-\d+$/, '')
}

// ---------------------------------------------------------------- load

const files = fs
  .readdirSync(COURSES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()

const courses = []
const topicsBySlug = new Map()

for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(COURSES_DIR, file), 'utf8'))
  const course = raw.course || raw
  const meta = course.metadata || {}
  const slug = course.slug || meta.slug || path.basename(file, '.json')
  const publicSlug = PUBLIC_SLUG_ALIASES[slug] || slug
  const grade = COURSE_GRADES[slug] || COURSE_GRADES[baseCourseSlug(slug)] || null
  const track = meta.track || course.track || null

  // The Karni courses carry track: 'psy' (the historical name of that track)
  // and are grouped by exam area instead of by school year.
  if (!grade && track !== 'psy') {
    console.warn(`  ! ${slug}: no grade in COURSE_GRADES and not a Karni course — left out of the grade pages`)
  }

  const chapters = (course.chapters || []).map((ch) => {
    const number = Number(ch.number)
    return {
      number,
      title: String(ch.title || '').trim(),
      objectives: (ch.learning_objectives || []).map((s) => String(s).trim()),
      summary: truncate(firstParagraph(ch.content), 155),
      exerciseCount: (ch.exercises || []).length,
      quizCount: (ch.quiz || []).length,
      exampleCount: (ch.examples || []).length,
      teaser: buildTeaser(ch.content),
    }
  })

  courses.push({
    slug: publicSlug,
    dbSlug: slug,
    title: String(meta.title || '').trim(),
    description: String(meta.description || '').trim(),
    level: meta.level || null,
    estimatedHours: meta.estimated_hours || null,
    grade,
    track,
    objectives: (course.learning_objectives || []).map((s) => String(s).trim()),
    chapterCount: chapters.length,
    chapters: chapters.map(({ number, title, summary }) => ({ number, title, summary })),
  })

  topicsBySlug.set(publicSlug, { chapters })
}

const bySlug = new Map(courses.map((c) => [c.dbSlug, c]))
const publicOf = (dbSlug) => bySlug.get(dbSlug)?.slug || PUBLIC_SLUG_ALIASES[dbSlug] || dbSlug

function resolveGroup(group) {
  const known = group.courseSlugs.flatMap((baseSlug) => {
    const groupCourses = [...bySlug.keys()]
      .filter((slug) => slug === baseSlug || slug.startsWith(`${baseSlug}--part-`))
      .sort((a, b) => a.localeCompare(b, 'en'))
    if (groupCourses.length) return groupCourses
    console.warn(`  ! group ${group.slug}: course ${baseSlug} not found in courses/ — skipped`)
    return []
  })
  return { ...group, courseSlugs: known.map(publicOf) }
}

const catalog = {
  generatedAt: new Date().toISOString().slice(0, 10),
  grades: GRADES.map((g) => ({
    ...g,
    courseSlugs: courses.filter((c) => c.grade === g.key).map((c) => c.slug),
  })),
  subjects: SUBJECTS.map(resolveGroup),
  karniAreas: KARNI_AREAS.map(resolveGroup),
  courses,
}

// Each topics file carries the course context its pages need — breadcrumbs,
// sibling chapters, the hub it belongs to — so a course or topic page needs
// one fetch, not two.
for (const course of courses) {
  const data = topicsBySlug.get(course.slug)
  const grade = catalog.grades.find((g) => g.key === course.grade) || null
  const subject = catalog.subjects.find((s) => s.courseSlugs.includes(course.slug)) || null
  const area = catalog.karniAreas.find((a) => a.courseSlugs.includes(course.slug)) || null
  data.course = {
    slug: course.slug,
    title: course.title,
    description: course.description,
    grade: course.grade,
    gradePath: grade?.path || null,
    gradeLabel: grade?.label || null,
    track: course.track,
    level: course.level,
    estimatedHours: course.estimatedHours,
    objectives: course.objectives,
    subject: subject ? { slug: subject.slug, title: subject.title } : null,
    karniArea: area ? { slug: area.slug, title: area.title } : null,
    chapters: course.chapters,
  }
}

// ---------------------------------------------------------------- write

fs.mkdirSync(DATA_OUT_DIR, { recursive: true })
fs.writeFileSync(CATALOG_OUT, JSON.stringify(catalog), 'utf8')

fs.rmSync(TOPICS_OUT_DIR, { recursive: true, force: true })
fs.mkdirSync(TOPICS_OUT_DIR, { recursive: true })
for (const [slug, data] of topicsBySlug) {
  fs.writeFileSync(path.join(TOPICS_OUT_DIR, `${slug}.json`), JSON.stringify(data), 'utf8')
}

const topicCount = [...topicsBySlug.values()].reduce((n, d) => n + d.chapters.length, 0)

// ---------------------------------------------------------------- stats
// מספרי הכותרת של דף הנחיתה, נגזרים מהקטלוג עצמו כדי שלא ייווצר פער בין מה
// שהאתר מבטיח לבין מה שבאמת יש בו.
const stats = {
  courses: courses.length,
  schoolCourses: courses.filter((c) => c.track !== 'psy').length,
  karniCourses: courses.filter((c) => c.track === 'psy').length,
  chapters: topicCount,
  hours: Math.round(courses.reduce((n, c) => n + (c.estimatedHours || 0), 0)),
  grades: catalog.grades.length,
}
fs.writeFileSync(
  STATS_OUT,
  `// נוצר אוטומטית ע"י scripts/seo/build_catalog.mjs — אין לערוך ידנית.
// מוחלף בכל בנייה (prebuild), ולכן המספרים בדף הנחיתה תמיד תואמים לתוכן.
export const CATALOG_STATS = ${JSON.stringify(stats, null, 2)}
`,
  'utf8',
)
console.log(
  `  + public catalog: ${courses.length} courses, ${topicCount} topics, ` +
    `${catalog.subjects.length} subjects, ${catalog.karniAreas.length} Karni areas`,
)
