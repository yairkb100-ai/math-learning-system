// Prerenders every public URL to static HTML after the Vite client build.
//
// Why this exists: the site is a client-rendered SPA, so without this step
// every public URL (курс/topic/grade page) would serve the same empty
// index.html shell to a crawler, with the real content arriving only after
// JavaScript runs. Google can execute JS but queues that render pass
// separately and can drop it under load; WhatsApp/Facebook/LinkedIn link
// previews don't execute JS at all. Prerendering means every public path
// ships real HTML — title, meta tags, JSON-LD and the visible text — on the
// very first response.
//
// How: `vite build --ssr src/entry-server.jsx` (invoked from package.json,
// before this script runs) produces a Node-importable server bundle. This
// script loads it, renders every public path from publicUrls(), and writes
// dist/<path>/index.html so Vercel's rewrite-to-index.html still serves the
// SPA for any path a route wasn't prerendered for (private routes, 404s).
//
// Signed-in-only routes are never touched: entry-server.jsx renders with no
// auth state, i.e. exactly the signed-out view, so there is nothing to leak.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { publicUrls, dataKeyForPath } from '../../frontend/src/lib/publicRoutes.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const FRONTEND = path.join(ROOT, 'frontend')
const DIST = path.join(FRONTEND, 'dist')
const DATA_DIR = path.join(FRONTEND, 'public', 'data')
const SSR_ENTRY = path.join(FRONTEND, 'dist-server', 'entry-server.js')

const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'catalog.json'), 'utf8'))

const dataCache = new Map()
function loadData(key) {
  if (dataCache.has(key)) return dataCache.get(key)
  const file = path.join(DATA_DIR, `${key}.json`)
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  dataCache.set(key, data)
  return data
}

function outputFile(urlPath) {
  const trimmed = urlPath.replace(/^\//, '')
  return trimmed
    ? path.join(DIST, trimmed, 'index.html')
    : path.join(DIST, 'index.html')
}

function injectHead(html, head) {
  const robots = head.noindex ? 'noindex, follow' : 'index, follow'
  const tags = [
    `<title>${escapeHtml(head.title)}</title>`,
    `<meta name="description" content="${escapeHtml(head.description)}" />`,
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${escapeHtml(head.canonical)}" />`,
    `<meta property="og:type" content="${escapeHtml(head.type)}" />`,
    `<meta property="og:title" content="${escapeHtml(head.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(head.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(head.canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(head.image)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...head.jsonLd.map((json) => `<script type="application/ld+json">${json}</script>`),
  ].join('\n    ')

  // Replace the static tags index.html ships (they describe "/") rather than
  // stacking a second set alongside them — two canonicals/titles is worse
  // than one wrong one.
  let out = html
  out = out.replace(/<title>[\s\S]*?<\/title>/, '')
  out = out.replace(/<meta\s+name="description"[^>]*>/, '')
  out = out.replace(/<meta\s+name="robots"[^>]*>/, '')
  out = out.replace(/<link\s+rel="canonical"[^>]*>/, '')
  out = out.replace(/<meta\s+property="og:[a-z]+"[^>]*>/g, '')
  out = out.replace(/<meta\s+name="twitter:card"[^>]*>/, '')
  out = out.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '')
  return out.replace('</head>', `  ${tags}\n  </head>`)
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

async function main() {
  const { render } = await import(pathToFileURL(SSR_ENTRY).href)
  const urls = publicUrls(catalog)
  let written = 0

  for (const { path: urlPath } of urls) {
    const key = dataKeyForPath(urlPath)
    const data = loadData(key)
    const dataBag = { [key]: data }

    const { html: appHtml, head } = render(urlPath, dataBag)

    let page = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
    page = injectHead(page, head)
    // Client hydration reads this instead of re-fetching /data/<key>.json —
    // the exact data that produced the HTML above, so hydration can't mismatch
    // on stale data racing a fetch.
    page = page.replace(
      '</head>',
      `  <script>window.__PUBLIC_DATA__ = ${JSON.stringify(dataBag)}</script>\n  </head>`,
    )

    const outFile = outputFile(urlPath)
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, page, 'utf8')
    written += 1
  }

  fs.rmSync(path.join(FRONTEND, 'dist-server'), { recursive: true, force: true })
  console.log(`  + prerendered ${written} public pages`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
