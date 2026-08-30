import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..', '..')
const sourceRoot = path.join(repoRoot, 'courses', 'assets')
const outputRoot = path.join(repoRoot, 'frontend', 'dist', 'course-assets')

async function copyPdfs(sourceDir, outputDir) {
  const entries = await readdir(sourceDir, { withFileTypes: true })
  let copied = 0

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const outputPath = path.join(outputDir, entry.name)

    if (entry.isDirectory()) {
      copied += await copyPdfs(sourcePath, outputPath)
      continue
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.pdf') {
      continue
    }

    await mkdir(outputDir, { recursive: true })
    await cp(sourcePath, outputPath)
    copied += 1
  }

  return copied
}

await rm(outputRoot, { recursive: true, force: true })
const copied = await copyPdfs(sourceRoot, outputRoot)
console.log(`Copied ${copied} course PDFs into the production bundle.`)
