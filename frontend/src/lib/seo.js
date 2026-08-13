import { useEffect } from 'react'

const SITE_NAME = 'לומדת מתמטיקה'

function setMeta(name, content, attr = 'name') {
  if (!content) return
  let tag = document.head.querySelector(`meta[${attr}="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attr, name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function setCanonical(path) {
  if (!path) return
  let link = document.head.querySelector('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', `https://math-learning-system-lyart.vercel.app${path}`)
}

// Public pages only (landing/login/register) — everything behind login is
// per-account content that Google can't crawl anyway, so there's no value in
// wiring this into every private page too.
export function usePageMeta({ title, description, path }) {
  useEffect(() => {
    const fullTitle = !title || title.includes(SITE_NAME) ? title || SITE_NAME : `${title} | ${SITE_NAME}`
    document.title = fullTitle
    setMeta('description', description)
    setMeta('og:title', fullTitle, 'property')
    setMeta('og:description', description, 'property')
    setCanonical(path)
  }, [title, description, path])
}

// Injects a <script type="application/ld+json"> keyed by `id` — used for
// page-specific structured data (e.g. FAQPage) that only applies while that
// route is mounted. Removes the tag on unmount so it doesn't leak onto other
// routes when the SPA navigates away without a full page reload.
export function useJsonLd(id, data) {
  useEffect(() => {
    if (!data) return undefined
    let tag = document.head.querySelector(`script[data-jsonld="${id}"]`)
    if (!tag) {
      tag = document.createElement('script')
      tag.type = 'application/ld+json'
      tag.setAttribute('data-jsonld', id)
      document.head.appendChild(tag)
    }
    tag.textContent = JSON.stringify(data)
    return () => {
      tag?.remove()
    }
  }, [id, data])
}
