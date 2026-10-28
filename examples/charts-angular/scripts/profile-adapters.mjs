// Run after benchmark-adapters.mjs builds the fixtures. Rebuilds optimized apps
// with source maps and serves them locally; PROFILE_URL can override the server.
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { chromium } from 'playwright'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname } from 'node:path'
import { serveAngularFixtures } from './angular-fixture-server.mjs'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, '.benchmark-output/angular-profiles')
const require = createRequire(import.meta.url)
// Resolve the source-map reader through the installed Angular build toolchain.
const buildRequire = createRequire(
  require.resolve('@angular/build/package.json'),
)
const remappingRequire = createRequire(
  buildRequire.resolve('@ampproject/remapping'),
)
const { TraceMap, originalPositionFor } = remappingRequire(
  '@jridgewell/trace-mapping',
)
const cases = [
  { name: 'svg-10000', variant: 'current', points: 10000, charts: 1 },
  {
    name: 'svg-10000-no-focus-ring',
    variant: 'current',
    points: 10000,
    charts: 1,
    noFocusRing: true,
  },
  { name: 'canvas-10000', variant: 'canvas', points: 10000, charts: 1 },
  {
    name: 'canvas-10000-no-focus-ring',
    variant: 'canvas',
    points: 10000,
    charts: 1,
    noFocusRing: true,
  },
  { name: 'dashboard-fixed', variant: 'current', points: 100, charts: 20 },
  {
    name: 'dashboard-responsive',
    variant: 'current',
    points: 100,
    charts: 20,
    responsive: true,
  },
]
await mkdir(output, { recursive: true })
if (!process.argv.includes('--skip-build')) {
  const cli = resolve(
    dirname(require.resolve('@angular/cli/package.json')),
    'bin/ng.js',
  )
  for (const variant of ['current', 'canvas']) {
    const { stdout, stderr } = await promisify(execFile)(
      process.execPath,
      [cli, 'build', variant, '--progress=false', '--source-map=true'],
      {
        cwd: resolve(root, '.benchmark-output/angular-adapters'),
        maxBuffer: 8e6,
        env: { ...process.env, NG_CLI_ANALYTICS: 'false' },
      },
    )
    await writeFile(resolve(output, variant + '-build.log'), stdout + stderr)
  }
}
const server = process.env.PROFILE_URL
  ? null
  : await serveAngularFixtures(
      resolve(root, '.benchmark-output/angular-adapters/dist'),
    )
const base = process.env.PROFILE_URL ?? server.url
let browser
const results = []
try {
  browser = await chromium.launch({ channel: 'chrome' })
  for (const scenario of cases) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${base}/${scenario.variant}/browser/index.html`)
    await page.waitForFunction(() => !!window.chartBenchmark)
    await page.evaluate(async (scenario) => {
      const app = window.chartBenchmark
      app.prepare(scenario.points, scenario.charts)
      window.profileDefinitions = [0, 1].map((phase) => ({
        ...app.definition(scenario.points, phase),
        ...(scenario.noFocusRing ? { focusRing: false } : {}),
      }))
      app.options.update((options) =>
        options.map((option) => ({
          ...option,
          definition: window.profileDefinitions[0],
          ...(scenario.responsive ? { width: undefined } : {}),
        })),
      )
      app.visible.set(true)
      app.tick()
      for (let i = 0; i < 6; i++) {
        app.setDefinition(window.profileDefinitions[(i + 1) % 2])
        app.tick()
      }
      await new Promise(requestAnimationFrame)
    }, scenario)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
    await cdp.send('Tracing.start', {
      categories:
        'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',
      transferMode: 'ReturnAsStream',
    })
    await cdp.send('Profiler.start')
    const samples = await page.evaluate(async () => {
      const app = window.chartBenchmark
      const samples = []
      for (let i = 0; i < 30; i++) {
        await new Promise(requestAnimationFrame)
        performance.mark(`chart-update-start-${i}`)
        const before = app.renders
        app.setDefinition(window.profileDefinitions[(i + 1) % 2])
        app.tick()
        document.body.getBoundingClientRect()
        performance.mark(`chart-update-end-${i}`)
        performance.measure(
          `chart-update-${i}`,
          `chart-update-start-${i}`,
          `chart-update-end-${i}`,
        )
        samples.push(
          performance.getEntriesByName(`chart-update-${i}`).at(-1).duration,
        )
        if (app.renders - before !== app.contexts.length)
          throw Error('Unexpected render count')
      }
      const scene = app.contexts[0].scene
      const defaultFocus = scene.nodes.filter((node) =>
        node.className?.includes('ts-chart__focus-layer--default'),
      )
      return {
        milliseconds: samples,
        points: scene.points.length,
        defaultFocusCandidates: defaultFocus.reduce(
          (sum, node) => sum + node.children.length,
          0,
        ),
      }
    })
    const { profile } = await cdp.send('Profiler.stop')
    const complete = new Promise((resolve) =>
      cdp.once('Tracing.tracingComplete', resolve),
    )
    await cdp.send('Tracing.end')
    const { stream } = await complete
    let data = ''
    while (true) {
      const chunk = await cdp.send('IO.read', { handle: stream })
      data += chunk.base64Encoded
        ? Buffer.from(chunk.data, 'base64').toString()
        : chunk.data
      if (chunk.eof) break
    }
    await cdp.send('IO.close', { handle: stream })
    const trace = JSON.parse(data)
    await writeFile(
      resolve(output, scenario.name + '.trace.json.gz'),
      gzipSync(data),
    )
    await writeFile(
      resolve(output, scenario.name + '.cpuprofile.gz'),
      gzipSync(JSON.stringify(profile)),
    )
    const events = trace.traceEvents
    const intervals = events
      .filter((e) => e.name?.startsWith('chart-update-start-'))
      .map((start) => {
        const end = events.find(
          (e) => e.name === start.name.replace('-start-', '-end-'),
        )
        return { start: start.ts, end: end.ts }
      })
    assert.equal(intervals.length, 30)
    const inside = (timestamp) =>
      intervals.some((i) => timestamp >= i.start && timestamp <= i.end)
    const timeline = {}
    for (const e of events) {
      if (
        e.ph !== 'X' ||
        !inside(e.ts) ||
        ![
          'Layout',
          'UpdateLayoutTree',
          'ParseHTML',
          'Paint',
          'MinorGC',
          'MajorGC',
        ].includes(e.name)
      )
        continue
      timeline[e.name] ??= { milliseconds: 0, count: 0 }
      timeline[e.name].milliseconds += e.dur / 1000
      timeline[e.name].count++
    }
    const rawMap = JSON.parse(
      await readFile(
        resolve(
          root,
          `.benchmark-output/angular-adapters/dist/${scenario.variant}/browser/main.js.map`,
        ),
        'utf8',
      ),
    )
    const map = new TraceMap(rawMap)
    const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
    const parents = new Map()
    for (const node of profile.nodes)
      for (const child of node.children ?? []) parents.set(child, node.id)
    const location = (node) => {
      const frame = node.callFrame
      if (!frame.url.endsWith('/main.js')) return null
      const original = originalPositionFor(map, {
        line: frame.lineNumber + 1,
        column: frame.columnNumber,
      })
      if (!original.source) return null
      const source = original.source.replace(/^.*?(packages\/)/, '$1')
      return {
        source,
        line: original.line,
        name: original.name ?? frame.functionName,
      }
    }
    const mapped = new Map(
      profile.nodes.map((node) => [node.id, location(node)]),
    )
    const files = {},
      functions = {},
      categories = {}
    let timestamp = profile.startTime
    for (let i = 0; i < profile.samples.length; i++) {
      // V8 can emit a small negative adjustment while matching its clocks.
      const delta = profile.timeDeltas[i]
      timestamp += delta
      if (!inside(timestamp)) continue
      const weight = Math.max(0, delta) / 1000
      let id = profile.samples[i]
      let owner = mapped.get(id)
      while (!owner && parents.has(id)) {
        id = parents.get(id)
        owner = mapped.get(id)
      }
      const file =
        owner?.source ?? nodes.get(profile.samples[i]).callFrame.functionName
      const category = file.startsWith('packages/angular-charts/')
        ? 'Angular adapter'
        : file.startsWith('packages/charts-core/')
          ? 'Chart core'
          : file.includes('packages/core/src/') || file.includes('@angular/')
            ? 'Angular framework'
            : file.includes('fixture') || file.includes('/App.ts')
              ? 'Harness'
              : 'Other/native'
      files[file] = (files[file] ?? 0) + weight
      categories[category] = (categories[category] ?? 0) + weight
      const key = owner ? `${owner.source}:${owner.line} (${owner.name})` : file
      functions[key] = (functions[key] ?? 0) + weight
    }
    const top = (values) =>
      Object.entries(values)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
    const sorted = [...samples.milliseconds].sort((a, b) => a - b)
    const result = {
      ...scenario,
      samples,
      median: (sorted[14] + sorted[15]) / 2,
      timeline,
      sampledMilliseconds: categories,
      topFiles: top(files),
      topFunctions: top(functions),
    }
    results.push(result)
    console.log(
      JSON.stringify({
        ...result,
        samples: {
          points: samples.points,
          defaultFocusCandidates: samples.defaultFocusCandidates,
        },
      }),
    )
    assert.deepEqual(errors, [])
    await page.close()
  }
  const controls = []
  // Disabling a focus ring changes semantics. This paired, untraced control
  // only estimates its cost; it is not a recommendation to remove focus UI.
  for (const variant of ['current', 'canvas']) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    })
    await page.goto(`${base}/${variant}/browser/index.html`)
    await page.waitForFunction(() => !!window.chartBenchmark)
    const result = await page.evaluate(async () => {
      const app = window.chartBenchmark
      app.prepare(10000, 1)
      const definitions = [0, 1].map((phase) => app.definition(10000, phase))
      const without = definitions.map((definition) => ({
        ...definition,
        focusRing: false,
      }))
      app.visible.set(true)
      app.tick()
      const samples = { normal: [], noFocusRing: [] }
      const dom = {}
      for (let round = -2; round < 5; round++) {
        for (const kind of round % 2
          ? ['normal', 'noFocusRing']
          : ['noFocusRing', 'normal']) {
          for (let i = 0; i < 12; i++) {
            await new Promise(requestAnimationFrame)
            const start = performance.now()
            app.setDefinition(
              (kind === 'normal' ? definitions : without)[i % 2],
            )
            app.tick()
            document.body.getBoundingClientRect()
            if (round >= 0) samples[kind].push(performance.now() - start)
          }
          dom[kind] = document.querySelectorAll('*').length
        }
      }
      return { samples, dom }
    })
    controls.push({ variant, ...result })
    console.log(
      'Paired focus diagnostic',
      JSON.stringify({ variant, ...result }),
    )
    await page.close()
  }
  await writeFile(
    resolve(output, 'summary.json'),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        results,
        controls,
      },
      null,
      2,
    ) + '\n',
  )
} finally {
  await browser?.close()
  await server?.close()
}
