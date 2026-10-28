import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { cpus, platform, release } from 'node:os'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'
import { serveAngularFixtures } from './angular-fixture-server.mjs'

const exec = promisify(execFile)
const example = resolve(import.meta.dirname, '..')
const repo = resolve(example, '../..')
const output = resolve(example, '.benchmark-output/angular-adapters')
const require = createRequire(resolve(example, 'package.json'))
const baseline = '778f2cc6'
const variants = ['empty', 'legacy', 'current', 'canvas']
const scenarios = [
  { points: 100, charts: 1 },
  { points: 1000, charts: 1 },
  { points: 10000, charts: 1 },
  { points: 100, charts: 20 },
]
const args = new Set(process.argv.slice(2))
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n: values.length,
    median:
      (sorted[Math.floor((sorted.length - 1) / 2)] +
        sorted[Math.floor(sorted.length / 2)]) /
      2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    min: sorted[0],
    max: sorted.at(-1),
  }
}
const save = (name, data) =>
  writeFile(resolve(output, name), JSON.stringify(data, null, 2) + '\n')

async function prepare() {
  await mkdir(resolve(output, 'src/legacy'), { recursive: true })
  // Compile the real historical component AND directive, without importing the
  // current adapter into the legacy bundle or editing historical behavior.
  for (const file of ['Chart.ts', 'ChartTooltipBody.ts', 'types.ts']) {
    const { stdout } = await exec(
      'git',
      ['show', `${baseline}:packages/angular-charts/src/${file}`],
      { cwd: repo },
    )
    await writeFile(resolve(output, 'src/legacy', file), stdout)
  }
  await writeFile(
    resolve(output, 'src/fixture.ts'),
    `
import { defineChart, dot, lineY } from '@tanstack/charts'
import { scaleLinear } from 'd3-scale'
export const scenario = { points: 100, charts: 1 }
export function definition(points: number, phase: number) {
  const rows = Array.from({ length: points }, (_, id) => ({
    id, x: id, y: 50 + 25 * Math.sin(id * .07 + phase * .3),
  }))
  return defineChart({
    marks: [
      lineY(rows, { id: 'line', x: 'x', y: 'y', key: 'id', stroke: '#7c3aed' }),
      dot(rows, { id: 'dots', x: 'x', y: 'y', key: 'id', r: 2, fill: '#7c3aed' }),
    ],
    scales: {
      x: { scale: scaleLinear().domain([0, points - 1]), axis: { ticks: { count: 5 } } },
      y: { scale: scaleLinear().domain([0, 100]), grid: true, axis: { ticks: { count: 5 } } },
    },
  })
}
`,
  )
  await writeFile(
    resolve(output, 'src/fixture-empty.ts'),
    `
export const scenario = { points: 100, charts: 1 }
export function definition(points: number, phase: number) { return { points, phase } }
`,
  )
  const projects = {}
  for (const variant of variants) {
    const directory = resolve(output, 'src', variant)
    await mkdir(directory, { recursive: true })
    const chartImport =
      variant === 'legacy'
        ? '../legacy/Chart'
        : variant === 'canvas'
          ? '@tanstack/charts/angular/canvas'
          : '@tanstack/charts/angular'
    const markup =
      variant === 'legacy'
        ? '<tanstack-chart [options]="option" />'
        : variant === 'canvas'
          ? '<div tanstack-canvas-chart [options]="option"></div>'
          : '<div tanstack-chart [options]="option"></div>'
    await writeFile(
      resolve(directory, 'App.ts'),
      `
import { ApplicationRef, ChangeDetectionStrategy, Component, PLATFORM_ID, inject, signal } from '@angular/core'
${variant === 'empty' ? '' : `import { Chart } from '${chartImport}'`}
import { definition, scenario } from '../fixture${variant === 'empty' ? '-empty' : ''}'
@Component({
  selector: 'benchmark-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [${variant === 'empty' ? '' : 'Chart'}],
  template: \`@if (visible()) { @for (option of options(); track option.idPrefix) { ${variant === 'empty' ? '<div class="empty-chart"></div>' : markup} } }\`,
})
export class App {
  readonly application = inject(ApplicationRef)
  readonly visible = signal(inject(PLATFORM_ID) === 'server')
  readonly options = signal<any[]>([])
  contexts: any[] = []
  renders = 0
  onRendered?: () => void
  constructor() { this.prepare(scenario.points, scenario.charts) }
  prepare(points: number, charts: number) {
    const chart = definition(points, 0)
    this.contexts = []
    this.options.set(Array.from({ length: charts }, (_, index) => ({
      definition: chart, width: 720, height: 320,
      idPrefix: 'benchmark-' + index, ariaLabel: 'Benchmark chart',
      onRender: (context: any) => {
        this.contexts[index] = context
        this.renders++
        this.onRendered?.()
      },
    })))
  }
  setDefinition(chart: any) {
    this.options.update(options => options.map(option => ({ ...option, definition: chart })))
  }
  definition(points: number, phase: number) { return definition(points, phase) }
  tick() { this.application.tick() }
}
`,
    )
    await writeFile(
      resolve(directory, 'main.ts'),
      `
import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { App } from './App'
bootstrapApplication(App, { providers: [provideZonelessChangeDetection()] }).then(ref => {
  ;(window as any).chartBenchmark = ref.components[0].instance
})
`,
    )
    await writeFile(
      resolve(directory, 'main.server.ts'),
      `
import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import type { BootstrapContext } from '@angular/platform-browser'
import { provideServerRendering, renderApplication } from '@angular/platform-server'
import { App } from './App'
import { scenario } from '../fixture${variant === 'empty' ? '-empty' : ''}'
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), provideServerRendering()],
}, context)
export default bootstrap
export async function renderOne(points: number, charts: number) {
  Object.assign(scenario, { points, charts })
  return renderApplication(bootstrap, {
    document: '<!doctype html><html><head></head><body><benchmark-app></benchmark-app></body></html>',
    url: 'http://localhost/',
    allowedHosts: ['localhost'],
  })
}
`,
    )
    await writeFile(
      resolve(directory, 'tsconfig.json'),
      JSON.stringify({
        extends: resolve(example, 'tsconfig.json'),
        compilerOptions: {
          outDir: resolve(output, 'out-tsc', variant),
          types: [],
        },
        files: ['./main.ts', './main.server.ts'],
      }),
    )
    projects[variant] = {
      projectType: 'application',
      root: `src/${variant}`,
      sourceRoot: `src/${variant}`,
      architect: {
        build: {
          builder: '@angular/build:application',
          options: {
            outputPath: `dist/${variant}`,
            index: 'src/index.html',
            browser: `src/${variant}/main.ts`,
            server: `src/${variant}/main.server.ts`,
            ssr: true,
            prerender: false,
            tsConfig: `src/${variant}/tsconfig.json`,
            aot: true,
            optimization: { scripts: true, styles: false, fonts: false },
            sourceMap: false,
            outputHashing: 'none',
            extractLicenses: true,
          },
        },
      },
    }
  }
  await writeFile(
    resolve(output, 'src/index.html'),
    '<!doctype html><html><head><base href="/"></head><body><benchmark-app></benchmark-app></body></html>',
  )
  await save('angular.json', {
    version: 1,
    projects,
    cli: { cache: { enabled: false } },
  })
  const cli = resolve(
    dirname(require.resolve('@angular/cli/package.json')),
    'bin/ng.js',
  )
  for (const variant of variants) {
    console.log(`Production AOT build: ${variant}`)
    const { stdout, stderr } = await exec(
      process.execPath,
      [cli, 'build', variant, '--progress=false'],
      {
        cwd: output,
        maxBuffer: 8e6,
        env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
      },
    )
    await writeFile(resolve(output, `${variant}-build.log`), stdout + stderr)
  }
}

async function measureBundles() {
  const sizes = {}
  for (const variant of variants) {
    const directory = resolve(output, 'dist', variant, 'browser')
    const files = []
    for (const name of (await readdir(directory)).filter((name) =>
      name.endsWith('.js'),
    )) {
      const bytes = await readFile(resolve(directory, name))
      files.push({
        name,
        raw: bytes.length,
        gzip: gzipSync(bytes, { level: 9 }).length,
        brotli: brotliCompressSync(bytes, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
        }).length,
      })
    }
    sizes[variant] = {
      files,
      raw: files.reduce((sum, f) => sum + f.raw, 0),
      gzip: files.reduce((sum, f) => sum + f.gzip, 0),
      brotli: files.reduce((sum, f) => sum + f.brotli, 0),
    }
  }
  await save('bundles.json', sizes)
  return sizes
}

async function measureSsr() {
  // All variants run in ONE process and alternate order to reduce drift. They
  // bundle their own Angular runtime, so importing the app's renderOne keeps DI
  // tokens and platform ownership within the corresponding production bundle.
  const modules = {}
  for (const variant of variants.filter((v) => v !== 'empty')) {
    modules[variant] = await import(
      pathToFileURL(resolve(output, 'dist', variant, 'server/main.server.mjs'))
    )
    assert.equal(typeof modules[variant].renderOne, 'function')
  }
  const results = []
  for (const scenario of scenarios) {
    const samples = { legacy: [], current: [], canvas: [] }
    const html = {}
    for (let iteration = -5; iteration < 40; iteration++) {
      const order =
        iteration % 2
          ? ['legacy', 'current', 'canvas']
          : ['canvas', 'current', 'legacy']
      for (const variant of order) {
        global.gc?.()
        const start = performance.now()
        const document = await modules[variant].renderOne(
          scenario.points,
          scenario.charts,
        )
        const elapsed = performance.now() - start
        const expected =
          variant === 'canvas' ? 'ts-chart-canvas__scene' : 'ts-chart__line'
        assert.ok(
          document.includes(expected),
          `${variant}: missing chart markup`,
        )
        if (iteration >= 0) samples[variant].push(elapsed)
        html[variant] = {
          raw: Buffer.byteLength(document),
          gzip: gzipSync(document, { level: 9 }).length,
        }
      }
    }
    const result = {
      ...scenario,
      milliseconds: Object.fromEntries(
        Object.entries(samples).map(([v, s]) => [v, stats(s)]),
      ),
      html,
      samples,
    }
    results.push(result)
    console.log('SSR', JSON.stringify({ ...result, samples: undefined }))
  }
  await save('ssr.json', results)
  return results
}

async function measureBrowser() {
  const { chromium } = await import('playwright')
  const server = await serveAngularFixtures(resolve(output, 'dist'))
  let browser
  const results = []
  try {
    browser = await chromium.launch()
    const pages = {}
    const errors = []
    for (const variant of ['legacy', 'current', 'canvas']) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      })
      page.on('pageerror', (error) =>
        errors.push(`${variant}: ${error.message}`),
      )
      await page.goto(`${server.url}/${variant}/browser/index.html`)
      await page.waitForFunction(() => !!window.chartBenchmark)
      pages[variant] = page
    }
    const browserVersion = browser.version()
    for (const scenario of scenarios) {
      const samples = {}
      for (let round = 0; round < 5; round++) {
        console.log(
          `Browser ${scenario.charts} × ${scenario.points} points: round ${round + 1}/5`,
        )
        const order =
          round % 2
            ? ['legacy', 'current', 'canvas']
            : ['canvas', 'current', 'legacy']
        for (const variant of order) {
          await pages[variant].bringToFront()
          const result = await pages[variant].evaluate(
            async ({ points, charts }) => {
              const app = window.chartBenchmark
              const frame = () =>
                new Promise((resolve) => requestAnimationFrame(resolve))
              app.visible.set(false)
              app.tick()
              app.prepare(points, charts)
              app.tick()
              const definitions = [
                app.definition(points, 0),
                app.definition(points, 1),
              ]
              const measure = (operation) => {
                const start = performance.now()
                operation()
                // Include synchronous style/layout work caused by the commit.
                document.body.getBoundingClientRect()
                return performance.now() - start
              }
              const mount = [],
                update = [],
                unmount = [],
                scheduled = [],
                firstFrame = [],
                settled = []
              for (let iteration = -3; iteration < 12; iteration++) {
                const before = app.renders
                const elapsed = measure(() => {
                  app.visible.set(true)
                  app.tick()
                })
                if (app.renders - before !== charts)
                  throw Error('Mount did not render exactly once per chart')
                if (iteration >= 0) mount.push(elapsed)
                const root = document.querySelector('svg, .ts-chart-canvas')
                const mark = document.querySelector(
                  '.ts-chart__line path, canvas',
                )
                for (let phase = 0; phase < 4; phase++) {
                  const before = app.renders
                  const previousY = app.contexts[0].scene.points[0].y
                  const elapsed = measure(() => {
                    app.setDefinition(definitions[(phase + 1) % 2])
                    app.tick()
                  })
                  if (app.renders - before !== charts)
                    throw Error('Update did not render exactly once per chart')
                  if (!root.isConnected || !mark.isConnected)
                    throw Error('Update replaced retained chart nodes')
                  if (app.contexts[0].scene.points[0].y === previousY)
                    throw Error('Update did not change point geometry')
                  if (iteration >= 0) update.push(elapsed)
                }
                const teardown = measure(() => {
                  app.visible.set(false)
                  app.tick()
                })
                if (document.querySelector('svg, canvas'))
                  throw Error('Chart nodes leaked after unmount')
                if (iteration >= 0) unmount.push(teardown)
              }
              app.visible.set(true)
              app.tick()
              await frame()
              const domNodes = document.querySelectorAll('*').length
              // Let Angular's actual zoneless scheduler deliver the input change.
              // Start just after a frame, independently of Playwright RPC latency.
              for (let iteration = -2; iteration < 10; iteration++) {
                await frame()
                const start = performance.now()
                await new Promise((resolve, reject) => {
                  const timeout = setTimeout(
                    () => reject(Error('Scheduled update timed out')),
                    10000,
                  )
                  let remaining = charts
                  app.onRendered = () => {
                    if (--remaining === 0) {
                      clearTimeout(timeout)
                      app.onRendered = undefined
                      resolve()
                    }
                  }
                  app.setDefinition(definitions[(iteration + 3) % 2])
                })
                if (iteration >= 0) scheduled.push(performance.now() - start)
                await frame()
                if (iteration >= 0) firstFrame.push(performance.now() - start)
                await frame()
                if (iteration >= 0) settled.push(performance.now() - start)
              }
              // Read the painted Canvas, not merely its presence in the DOM.
              const canvas = document.querySelector('.ts-chart-canvas__scene')
              if (
                canvas &&
                !canvas
                  .getContext('2d')
                  .getImageData(0, 0, canvas.width, canvas.height)
                  .data.some((v, i) => i % 4 === 3 && v > 0)
              )
                throw Error('Canvas was not painted')
              app.visible.set(false)
              app.tick()
              return {
                mount,
                update,
                unmount,
                scheduled,
                firstFrame,
                settled,
                domNodes,
              }
            },
            scenario,
          )
          samples[variant] ??= {
            mount: [],
            update: [],
            unmount: [],
            scheduled: [],
            firstFrame: [],
            settled: [],
            domNodes: result.domNodes,
          }
          for (const metric of [
            'mount',
            'update',
            'unmount',
            'scheduled',
            'firstFrame',
            'settled',
          ])
            samples[variant][metric].push(...result[metric])
        }
      }
      const result = {
        ...scenario,
        samples,
        variants: Object.fromEntries(
          Object.entries(samples).map(([variant, sample]) => [
            variant,
            {
              ...Object.fromEntries(
                [
                  'mount',
                  'update',
                  'unmount',
                  'scheduled',
                  'firstFrame',
                  'settled',
                ].map((metric) => [metric, stats(sample[metric])]),
              ),
              domNodes: sample.domNodes,
            },
          ]),
        ),
      }
      results.push(result)
      console.log('Browser', JSON.stringify({ ...result, samples: undefined }))
    }
    assert.deepEqual(errors, [])
    const result = { browser: browserVersion, scenarios: results }
    await save('browser.json', result)
    return result
  } finally {
    await browser?.close()
    await server.close()
  }
}

await mkdir(output, { recursive: true })
if (!args.has('--skip-build')) await prepare()
const { stdout: head } = await exec('git', ['rev-parse', 'HEAD'], { cwd: repo })
await save('environment.json', {
  date: new Date().toISOString(),
  baseline,
  head: head.trim(),
  node: process.version,
  angular: require('@angular/core/package.json').version,
  cli: require('@angular/cli/package.json').version,
  os: `${platform()} ${release()}`,
  cpu: cpus()[0].model,
  gc: typeof global.gc === 'function',
})
await measureBundles()
if (args.has('--build-only')) process.exit(0)
if (!args.has('--browser-only')) await measureSsr()
if (!args.has('--ssr-only')) await measureBrowser()
console.log(`Raw results: ${output}`)
