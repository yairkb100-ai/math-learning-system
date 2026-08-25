import { useEffect, useState } from 'react'

// The public catalog (courses, chapters, teasers) is static JSON under
// /data/, not part of the JS bundle: it is ~200KB of Hebrew that only the
// public pages need, and a signed-in student should never pay for it.
//
// Three ways a page gets its data, in order:
//   1. Already inlined in the page — the prerenderer writes the exact JSON a
//      static page needs into window.__PUBLIC_DATA__, so a crawler (and a
//      first-time visitor) sees the content with no second request at all.
//   2. From this module's cache, on later client-side navigations.
//   3. Fetched from /data/<key>.json.
//
// `key` is "catalog" or "topics/<course-slug>".

const cache = new Map()

function inlined(key) {
  const bag = typeof globalThis !== 'undefined' ? globalThis.__PUBLIC_DATA__ : null
  return bag && Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : undefined
}

export function readPublicData(key) {
  const fromPage = inlined(key)
  if (fromPage !== undefined) {
    cache.set(key, fromPage)
    return fromPage
  }
  return cache.get(key)
}

export function publicDataUrl(key) {
  return `/data/${key}.json`
}

export function usePublicData(key) {
  const [data, setData] = useState(() => readPublicData(key) ?? null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const known = readPublicData(key)
    if (known !== undefined) {
      setData(known)
      setError(null)
      return undefined
    }
    let alive = true
    setData(null)
    setError(null)
    fetch(publicDataUrl(key))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((json) => {
        cache.set(key, json)
        if (alive) setData(json)
      })
      .catch((e) => alive && setError(e))
    return () => {
      alive = false
    }
  }, [key])

  return { data, error, loading: !data && !error }
}
