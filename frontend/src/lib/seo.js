import { useEffect } from 'react'
import { SITE_NAME, SITE_URL, OG_IMAGE } from './site.js'

// Per-page <head> for a single-page app, in both directions:
//
//  - In the browser the hooks patch document.head on navigation, so the tab
//    title, description and canonical always describe the page you're on.
//  - During the build (scripts/seo/prerender.mjs renders these same pages with
//    react-dom/server) there is no document, so the hooks record into `ssrHead`
//    instead and the prerenderer bakes the tags into the static HTML.
//
// The second half is the one that matters for search: without it every public
// URL would ship index.html's canonical — which points at "/" — and Google
// would fold the whole public layer into the homepage.

const isServer = typeof document === 'undefined'

export const ssrHead = {
  title: '',
  description: '',
  canonical: '',
  image: '',
  type: 'website',
  noindex: false,
  jsonLd: [],
}

export function resetSsrHead() {
  ssrHead.title = ''
  ssrHead.description = ''
  ssrHead.canonical = ''
  ssrHead.image = ''
  ssrHead.type = 'website'
  ssrHead.noindex = false
  ssrHead.jsonLd = []
}

export function fullTitle(title) {
  if (!title) return SITE_NAME
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
}

function setMeta(name, content, attr = 'name') {
  const selector = `meta[${attr}="${name}"]`
  let tag = document.head.querySelector(selector)
  if (!content) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setLink(rel, href) {
  let link = document.head.querySelector(`link[rel="${rel}"]`)
  if (!href) {
    link?.remove()
    return
  }
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', rel)
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

/**
 * Title, description, canonical, Open Graph and the robots directive for one
 * page. `path` is the canonical path ("/courses/grade7-algebra") — pass it for
 * every public page, and pass `noindex` for anything that shouldn't be in the
 * index (login, register, private screens, 404).
 */
export function usePageMeta({ title, description, path, image, type = 'website', noindex = false }) {
  const resolvedTitle = fullTitle(title)
  const canonical = path ? `${SITE_URL}${path}` : ''
  const resolvedImage = image || OG_IMAGE

  if (isServer) {
    ssrHead.title = resolvedTitle
    ssrHead.description = description || ''
    ssrHead.canonical = canonical
    ssrHead.image = resolvedImage
    ssrHead.type = type
    ssrHead.noindex = noindex
  }

  useEffect(() => {
    document.title = resolvedTitle
    setMeta('description', description)
    setMeta('robots', noindex ? 'noindex, follow' : 'index, follow')
    setMeta('og:title', resolvedTitle, 'property')
    setMeta('og:description', description, 'property')
    setMeta('og:type', type, 'property')
    setMeta('og:url', canonical, 'property')
    setMeta('og:image', resolvedImage, 'property')
    setMeta('twitter:card', 'summary_large_image')
    setMeta('twitter:title', resolvedTitle)
    setMeta('twitter:description', description)
    setMeta('twitter:image', resolvedImage)
    setLink('canonical', canonical)
  }, [resolvedTitle, description, canonical, resolvedImage, type, noindex])
}

/** Shorthand for screens that exist only for signed-in users. */
export function useNoIndex(title) {
  usePageMeta({ title, description: '', path: '', noindex: true })
}

/**
 * Injects a <script type="application/ld+json"> keyed by `id`. Removed on
 * unmount so structured data for one route never leaks onto the next during
 * client-side navigation.
 */
export function useJsonLd(id, data) {
  const json = data ? JSON.stringify(data) : ''

  if (isServer && json) ssrHead.jsonLd.push(json)

  useEffect(() => {
    if (!json) return undefined
    const tag = document.createElement('script')
    tag.type = 'application/ld+json'
    tag.setAttribute('data-jsonld', id)
    tag.textContent = json
    document.head.appendChild(tag)
    return () => tag.remove()
  }, [id, json])
}

/** BreadcrumbList structured data from the same trail the page renders. */
export function breadcrumbJsonLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: crumb.label,
      ...(crumb.to ? { item: `${SITE_URL}${crumb.to}` } : {}),
    })),
  }
}
