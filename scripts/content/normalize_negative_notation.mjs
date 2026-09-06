import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const coursesDir = path.join(root, 'courses')
const write = process.argv.includes('--write')
const check = process.argv.includes('--check')

const numberPattern = /-(\d+(?:\.\d+)?)/g

function insideOpenDelimiter(text, start) {
  const stack = []
  const pairs = { ')': '(', ']': '[', '}': '{' }
  for (let i = 0; i < start; i += 1) {
    const char = text[i]
    if ('([{'.includes(char)) stack.push(char)
    if (')]}'.includes(char) && stack.at(-1) === pairs[char]) stack.pop()
  }
  return stack.length > 0
}

function isAlreadyClear(text, start, end) {
  let left = start - 1
  while (left >= 0 && /\s/.test(text[left])) left -= 1
  let right = end
  while (right < text.length && /\s/.test(text[right])) right += 1

  if (text[left] === '(' && text[right] === ')') return true

  // Do not turn -2^2 into (-2)^2 (different mathematics), and keep standard
  // coefficient notation such as -2x and -3\sqrt{x} uncluttered.
  if (right < text.length && /[A-Za-z\\^]/.test(text[right])) return true

  // Coordinates, intervals, sets, function arguments and negative exponents
  // already establish an unambiguous LTR mathematical context.
  if ((left >= 0 && '([{'.includes(text[left])) || insideOpenDelimiter(text, start)) {
    return true
  }

  return false
}

function isUnaryNumber(text, start) {
  let left = start - 1
  while (left >= 0 && /\s/.test(text[left])) left -= 1
  if (left < 0) return true

  const previous = text[left]
  if (/[\dA-Za-z\u0590-\u05ff)]/.test(previous)) return false
  if (previous === '}' || previous === ']') return false

  const prefix = text.slice(0, start).trimEnd()
  if (/\\(?:times|cdot|div|Rightarrow|Longrightarrow)$/.test(prefix)) {
    return true
  }

  // Operators, relations, separators, alignment markers and absolute-value
  // bars introduce a signed operand rather than a subtraction operation.
  return '=+,;:&|*/'.includes(previous) || previous === '-'
}

function normalizeMath(body) {
  const asciiBody = body.replace(/−(?=\d)/g, '-')
  return asciiBody.replace(numberPattern, (full, digits, offset) => {
    const end = offset + full.length
    if (!isUnaryNumber(asciiBody, offset) || isAlreadyClear(asciiBody, offset, end)) {
      return full
    }
    return `(-${digits})`
  })
}

function normalizeMathSpans(value) {
  let result = ''
  let cursor = 0
  while (cursor < value.length) {
    const start = value.indexOf('$', cursor)
    if (start < 0) return result + value.slice(cursor)

    result += value.slice(cursor, start)
    const fence = value.startsWith('$$', start) ? '$$' : '$'
    const bodyStart = start + fence.length
    const end = value.indexOf(fence, bodyStart)
    if (end < 0) return result + value.slice(start)

    result += `${fence}${normalizeMath(value.slice(bodyStart, end))}${fence}`
    cursor = end + fence.length
  }
  return result
}

function normalizeString(value) {
  let result = normalizeMathSpans(value)

  // A Unicode minus followed by a number in prose is visually unstable in an
  // RTL sentence. Put the complete signed number in an LTR math island.
  result = result.replace(/(^|[\s:;,])−(\d+(?:\.\d+)?)(?!\d)/g, '$1$(-$2)$')

  // Short quiz options and answers are sometimes stored without $...$.
  if (/^-\d+(?:\.\d+)?$/.test(result.trim())) {
    result = result.replace(/^-/, '(-').replace(/$/, ')')
  }

  return result
}

function visit(value) {
  if (typeof value === 'string') return normalizeString(value)
  if (Array.isArray(value)) return value.map(visit)
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) value[key] = visit(child)
  }
  return value
}

if (process.argv.includes('--probe')) {
  console.log(normalizeString('$-4 - 6 = -10$'))
  console.log(normalizeString('$$-3x = -9 \\Longrightarrow x = -3$$'))
  console.log(normalizeString('$A(-4,3)$ and $-2^2$ and $(-2)^2$'))
  process.exit(0)
}

const changed = []
for (const name of fs.readdirSync(coursesDir).filter((name) => name.endsWith('.json'))) {
  // The Karni preparation area is a separate product, not the school-math
  // learning environment requested here.
  if (name.startsWith('karni-')) continue

  const file = path.join(coursesDir, name)
  const before = fs.readFileSync(file, 'utf8')
  const normalizedBefore = before.replace(/\r\n/g, '\n')
  const data = visit(JSON.parse(normalizedBefore))
  const trailingNewline = normalizedBefore.endsWith('\n') ? '\n' : ''
  const normalizedAfter = `${JSON.stringify(data, null, 2)}${trailingNewline}`
  if (normalizedAfter === normalizedBefore) continue

  changed.push(name)
  if (write) {
    const eol = before.includes('\r\n') ? '\r\n' : '\n'
    fs.writeFileSync(file, normalizedAfter.replace(/\n/g, eol), 'utf8')
  }
}

console.log(`${write ? 'updated' : 'would update'} ${changed.length} course files`)
for (const name of changed) console.log(name)
if (check && changed.length > 0) process.exitCode = 1
