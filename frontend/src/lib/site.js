// One place that knows where the site lives.
//
// Every canonical URL, og:url, sitemap entry and robots.txt line is built from
// SITE_URL, so moving to a custom domain is a single change: set VITE_SITE_URL
// in the Vercel project (Production + Preview) and redeploy. Nothing else in
// the app hardcodes the host.
export const SITE_URL = (
  import.meta.env?.VITE_SITE_URL || 'https://math-learning-system-lyart.vercel.app'
).replace(/\/$/, '')

export const SITE_NAME = 'לומדת מתמטיקה'

// Shared social-preview card (WhatsApp / Facebook / LinkedIn). Pages may pass
// their own, but every public page has at least this one.
export const OG_IMAGE = `${SITE_URL}/og-cover.png`

// Only what the site already publishes in its footer. An email address is
// deliberately not here — adding one to a public page is the owner's call.
export const CONTACT_PHONE = '054-595-3631'
export const CONTACT_PHONE_E164 = '+972545953631'
export const OWNER_NAME = 'יאיר כהנא'

export const absoluteUrl = (path = '/') => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
