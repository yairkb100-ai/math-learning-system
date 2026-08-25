import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'
import { resetSsrHead, ssrHead } from './lib/seo.js'

// Used only by scripts/seo/prerender.mjs (via `vite build --ssr`), never
// shipped to the browser. main.jsx renders <App/> inside a BrowserRouter;
// here it goes inside a StaticRouter fixed at one URL instead — App itself
// doesn't know or care which Router wraps it.
export function render(url, dataBag) {
  resetSsrHead()
  globalThis.__PUBLIC_DATA__ = dataBag || {}
  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  )
  return { html, head: { ...ssrHead } }
}
