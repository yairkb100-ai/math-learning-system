// Generates frontend/public/sitemap.xml (and refreshes robots.txt's Sitemap:
// line) from the same catalog.json build_catalog.mjs just produced, so the
// sitemap can never list a course that doesn't actually have a page and can
// never miss one that does — one dynamic course/chapter table, no hand-kept
// list of URLs to remember to update.
//
// Reads the site's own domain from VITE_SITE_URL (see frontend/src/lib/site.js)
// so a custom-domain migration only means setting that env var in Vercel —
// this script and robots.txt pick it up on the next build automatically.
//
// Run via `npm run build` in frontend/ (prebuild, after build_catalog.mjs) or
// directly: node scripts/seo/build_sitemap.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { publicUrls } from '../../frontend/src/lib/publicRoutes.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CATALOG_PATH = path.join(ROOT, 'frontend', 'public', 'data', 'catalog.json')
const SITEMAP_PATH = path.join(ROOT, 'frontend', 'public', 'sitemap.xml')
const ROBOTS_PATH = path.join(ROOT, 'frontend', 'public', 'robots.txt')

const SITE_URL = (process.env.VITE_SITE_URL || 'https://math-learning-system-lyart.vercel.app').replace(/\/$/, '')

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))
const today = new Date().toISOString().slice(0, 10)

const urls = publicUrls(catalog)

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(
    (u) =>
      `  <url>\n` +
      `    <loc>${SITE_URL}${u.path}</loc>\n` +
      `    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>${u.changefreq}</changefreq>\n` +
      `    <priority>${u.priority}</priority>\n` +
      `  </url>`,
  ),
  '</urlset>',
  '',
].join('\n')

fs.writeFileSync(SITEMAP_PATH, xml, 'utf8')

const robots = fs.readFileSync(ROBOTS_PATH, 'utf8')
const updatedRobots = robots.replace(/^Sitemap:.*$/m, `Sitemap: ${SITE_URL}/sitemap.xml`)
fs.writeFileSync(ROBOTS_PATH, updatedRobots, 'utf8')

console.log(`  + sitemap.xml: ${urls.length} URLs (${SITE_URL})`)
