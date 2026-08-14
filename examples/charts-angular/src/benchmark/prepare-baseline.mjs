import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const exampleRoot = resolve(import.meta.dirname, '../..')
const repositoryRoot = resolve(exampleRoot, '../..')
const outputRoot = resolve(exampleRoot, '.benchmark-baseline')
const files = ['Chart.ts', 'ChartTooltipBody.ts', 'index.ts', 'types.ts']

await mkdir(outputRoot, { recursive: true })
for (const file of files) {
  const { stdout } = await execFileAsync(
    'git',
    ['show', `main:packages/angular-charts/src/${file}`],
    { cwd: repositoryRoot },
  )
  await writeFile(resolve(outputRoot, file), stdout)
}

console.log(`Prepared the main-branch Angular adapter in ${outputRoot}.`)
