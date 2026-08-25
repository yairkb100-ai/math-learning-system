// The URL shape of the public layer, in one place.
//
// Imported both by the React app and by scripts/seo/prerender.mjs (plain ESM,
// no JSX, no vite-only syntax on purpose) so the routes, the sitemap and the
// prerendered files can never drift apart.

export const paths = {
  home: () => '/',
  courses: () => '/courses',
  course: (slug) => `/courses/${slug}`,
  topic: (courseSlug, number) => `/topics/${courseSlug}/${number}`,
  subjects: () => '/subjects',
  subject: (slug) => `/subjects/${slug}`,
  grade: (gradePath) => `/${gradePath}`,
  karni: () => '/karni',
  karniArea: (slug) => `/karni/${slug}`,
  about: () => '/about',
  faq: () => '/faq',
  contact: () => '/contact',
  register: () => '/register',
  login: () => '/login',
}

/**
 * Every public URL, in the order they should be crawled. `catalog` is the
 * parsed frontend/public/data/catalog.json.
 */
export function publicUrls(catalog) {
  const urls = [
    { path: paths.home(), priority: '1.0', changefreq: 'weekly' },
    { path: paths.courses(), priority: '0.9', changefreq: 'weekly' },
    { path: paths.subjects(), priority: '0.8', changefreq: 'monthly' },
    { path: paths.karni(), priority: '0.9', changefreq: 'monthly' },
    { path: paths.about(), priority: '0.5', changefreq: 'yearly' },
    { path: paths.faq(), priority: '0.6', changefreq: 'monthly' },
    { path: paths.contact(), priority: '0.5', changefreq: 'yearly' },
  ]

  for (const grade of catalog.grades) {
    if (!grade.courseSlugs.length) continue
    urls.push({ path: paths.grade(grade.path), priority: '0.9', changefreq: 'monthly' })
  }
  for (const area of catalog.karniAreas) {
    if (!area.courseSlugs.length) continue
    urls.push({ path: paths.karniArea(area.slug), priority: '0.7', changefreq: 'monthly' })
  }
  for (const subject of catalog.subjects) {
    if (!subject.courseSlugs.length) continue
    urls.push({ path: paths.subject(subject.slug), priority: '0.7', changefreq: 'monthly' })
  }
  for (const course of catalog.courses) {
    urls.push({ path: paths.course(course.slug), priority: '0.8', changefreq: 'monthly' })
    for (const chapter of course.chapters) {
      urls.push({
        path: paths.topic(course.slug, chapter.number),
        priority: '0.6',
        changefreq: 'monthly',
      })
    }
  }
  return urls
}

/** Which /data/<key>.json a public path needs — used to inline it at build. */
export function dataKeyForPath(path) {
  const topic = path.match(/^\/topics\/([^/]+)\/\d+$/)
  if (topic) return `topics/${topic[1]}`
  const course = path.match(/^\/courses\/(.+)$/)
  if (course) return `topics/${course[1]}`
  return 'catalog'
}
