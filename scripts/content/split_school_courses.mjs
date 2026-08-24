import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const COURSES_DIR = path.join(ROOT, 'courses')
const MAX_CHAPTERS = 5
const HEBREW_PARTS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳']
const titleForPart = (title, part) => `${title} — חלק ${HEBREW_PARTS[part - 1] || part}`
const countWords = (chapter) => String(chapter.content || '').trim().split(/\s+/).filter(Boolean).length

for (const file of fs.readdirSync(COURSES_DIR).filter((name) => name.endsWith('.json')).sort()) {
  const sourcePath = path.join(COURSES_DIR, file)
  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8'))
  const course = raw.course || raw
  const meta = course.metadata || {}
  const chapters = course.chapters || []
  if (meta.track === 'psy' || meta.course_part || chapters.length <= MAX_CHAPTERS) continue

  const baseSlug = course.slug || meta.slug || path.basename(file, '.json')
  const baseTitle = String(meta.title || '').trim()
  const parts = Array.from({ length: Math.ceil(chapters.length / MAX_CHAPTERS) }, (_, index) => chapters.slice(index * MAX_CHAPTERS, (index + 1) * MAX_CHAPTERS))
  const totalWords = chapters.reduce((sum, chapter) => sum + countWords(chapter), 0) || 1
  const totalHours = Number(meta.estimated_hours) || 0

  parts.forEach((part, index) => {
    const number = index + 1
    const partChapters = part.map((chapter, chapterIndex) => ({ ...chapter, number: chapterIndex + 1 }))
    const partWords = partChapters.reduce((sum, chapter) => sum + countWords(chapter), 0)
    const slug = number === 1 ? baseSlug : `${baseSlug}--part-${number}`
    const title = titleForPart(baseTitle, number)
    const description = `${title} (${number} מתוך ${parts.length}): ${partChapters[0]?.title || ''} ועד ${partChapters.at(-1)?.title || ''}.`
    const partCourse = {
      ...course,
      slug,
      metadata: {
        ...meta, title, description, slug, chapters: partChapters.length,
        word_count: Math.round((Number(meta.word_count) || totalWords) * partWords / totalWords),
        estimated_hours: totalHours ? Math.round(totalHours * partWords / totalWords * 10) / 10 : null,
        course_part: { base_slug: baseSlug, number, total: parts.length },
      },
      chapters: partChapters,
    }
    const output = raw.course ? { ...raw, course: partCourse } : partCourse
    const outputPath = number === 1 ? sourcePath : path.join(COURSES_DIR, `${path.basename(file, '.json')}--part-${number}.json`)
    fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  })
}
