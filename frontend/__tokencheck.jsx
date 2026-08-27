import { renderToStaticMarkup } from 'react-dom/server'
import FractionArt from './src/components/FractionArt.jsx'
import tokens from './__tokens.json'

let bad = 0
for (const t of tokens) {
  let html = '', err = null
  try {
    html = renderToStaticMarkup(
      <FractionArt kind={t.kind} n={t.n ?? undefined} d={t.d ?? undefined}
                   param={t.param ?? undefined} caption={t.caption ?? undefined} />
    )
  } catch (e) { err = e.message }
  if (err || !html.includes('<svg')) {
    bad++
    console.log(`EMPTY  ${t.file}  ${t.raw.slice(0, 130)}${err ? '   ERR: ' + err : ''}`)
  }
}
console.log(`\n${tokens.length} tokens checked, ${bad} render as NOTHING`)
process.exit(bad ? 1 : 0)
