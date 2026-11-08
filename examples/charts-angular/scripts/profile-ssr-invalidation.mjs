import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const root = resolve(import.meta.dirname, '..')
const apf = process.argv.includes('--apf')
const workspace = resolve(
  root,
  '.benchmark-output',
  apf ? 'angular-adapters-apf' : 'angular-adapters',
)
const output = resolve(root, '.benchmark-output/angular-profiles')
const directory = resolve(workspace, 'src/ssr-probe')
await mkdir(directory, { recursive: true })
await mkdir(output, { recursive: true })
const require = createRequire(import.meta.url)
const config = JSON.parse(
  await readFile(resolve(workspace, 'angular.json'), 'utf8'),
)
const project = structuredClone(config.projects.current)
project.root = project.sourceRoot = 'src/ssr-probe'
Object.assign(project.architect.build.options, {
  outputPath: 'dist/ssr-probe',
  browser: 'src/ssr-probe/main.ts',
  server: 'src/ssr-probe/main.server.ts',
  tsConfig: 'src/ssr-probe/tsconfig.json',
  sourceMap: false,
})
config.projects['ssr-probe'] = project
await writeFile(
  resolve(workspace, 'angular.json'),
  JSON.stringify(config, null, 2),
)
await writeFile(
  resolve(workspace, 'src/ssr-probe-fixture.ts'),
  `
export { definition } from './fixture'
export const scenario = { points:10000, charts:1, mode:'none', serializations:0 }
`,
)
let app = await readFile(resolve(workspace, 'src/current/App.ts'), 'utf8')
app = app.replace(
  'import { ApplicationRef,',
  'import { PendingTasks, ApplicationRef,',
)
app = app.replace("from '../fixture'", "from '../ssr-probe-fixture'")
app = app.replace(
  '@Component({',
  `
import { renderChartSvg } from '@tanstack/charts/svg'
const countedSvg = (...args: Parameters<typeof renderChartSvg>) => {
  scenario.serializations++
  return renderChartSvg(...args)
}
@Component({`,
)
app = app.replace(
  'constructor() { this.prepare(scenario.points, scenario.charts) }',
  `
constructor() {
  this.prepare(scenario.points, scenario.charts)
  if (inject(PLATFORM_ID) === 'server') {
    const done = inject(PendingTasks).add()
    setTimeout(() => {
      if (scenario.mode === 'callback') this.options.update(options => options.map(option => ({...option, onFocusChange: () => {}})))
      if (scenario.mode === 'data') this.setDefinition(definition(scenario.points, 1))
      done()
    }, 0)
  }
}`,
)
app = app.replace(
  'definition: chart, width: 720',
  'definition: chart, renderSvg:countedSvg, width: 720',
)
assert.ok(app.includes('const done = inject(PendingTasks).add()'))
await writeFile(resolve(directory, 'App.ts'), app)
for (const file of ['main.ts', 'tsconfig.json'])
  await writeFile(
    resolve(directory, file),
    await readFile(resolve(workspace, 'src/current', file)),
  )
let server = await readFile(
  resolve(workspace, 'src/current/main.server.ts'),
  'utf8',
)
server = server.replace("from '../fixture'", "from '../ssr-probe-fixture'")
server += `
export async function renderProbe(mode:string, queued:boolean) {
  scenario.mode=mode
  scenario.serializations=0
  const html=await renderOne(10000,1,queued)
  return { serializations:scenario.serializations, html }
}
`
await writeFile(resolve(directory, 'main.server.ts'), server)
const cli = resolve(
  dirname(require.resolve('@angular/cli/package.json')),
  'bin/ng.js',
)
const { stdout, stderr } = await promisify(execFile)(
  process.execPath,
  [cli, 'build', 'ssr-probe', '--progress=false'],
  {
    cwd: workspace,
    maxBuffer: 8e6,
    env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
  },
)
await writeFile(resolve(output, 'ssr-probe-build.log'), stdout + stderr)
const { renderProbe } = await import(
  pathToFileURL(resolve(workspace, 'dist/ssr-probe/server/main.server.mjs'))
)
const modes = ['none', 'callback', 'data']
const results = Object.fromEntries(
  ['effect', 'queued'].map((strategy) => [
    strategy,
    Object.fromEntries(modes.map((mode) => [mode, []])),
  ]),
)
const baselineMarkup = {}
for (let iteration = -3; iteration < 20; iteration++) {
  const order = iteration % 2 ? ['effect', 'queued'] : ['queued', 'effect']
  for (const strategy of order)
    for (const mode of modes) {
      global.gc?.()
      const start = performance.now()
      const result = await renderProbe(mode, strategy === 'queued')
      const milliseconds = performance.now() - start
      assert.equal(
        result.serializations,
        strategy === 'queued' || mode === 'none' ? 1 : 2,
      )
      assert.ok(result.html.includes('ts-chart__line'))
      // APP_ID/ng-server metadata can vary between requests. Compare chart SVG.
      const svg = result.html.match(/<svg[\s\S]*?<\/svg>/)?.[0]
      assert.ok(svg)
      if (mode === 'none') baselineMarkup[strategy] = svg
      if (mode === 'callback') assert.equal(svg, baselineMarkup[strategy])
      if (mode === 'data') assert.notEqual(svg, baselineMarkup[strategy])
      if (strategy === 'effect') baselineMarkup[mode] = svg
      else if (baselineMarkup[mode]) assert.equal(svg, baselineMarkup[mode])
      if (iteration >= 0)
        results[strategy][mode].push({
          milliseconds,
          serializations: result.serializations,
        })
    }
}
const summary = Object.fromEntries(
  Object.entries(results).map(([strategy, modes]) => [
    strategy,
    Object.fromEntries(
      Object.entries(modes).map(([mode, samples]) => {
        const sorted = samples.map((v) => v.milliseconds).sort((a, b) => a - b)
        return [
          mode,
          {
            median: (sorted[9] + sorted[10]) / 2,
            serializations: samples[0].serializations,
            samples,
          },
        ]
      }),
    ),
  ]),
)
const { stdout: head } = await promisify(execFile)(
  'git',
  ['rev-parse', 'HEAD'],
  { cwd: root },
)
await writeFile(
  resolve(output, apf ? 'ssr-invalidation-apf.json' : 'ssr-invalidation.json'),
  JSON.stringify(
    {
      date: new Date().toISOString(),
      head: head.trim(),
      points: 10000,
      gc: typeof global.gc === 'function',
      summary,
    },
    null,
    2,
  ) + '\n',
)
console.log(JSON.stringify(summary))
