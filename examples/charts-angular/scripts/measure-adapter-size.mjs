// Requires finalized packages/angular-charts/dist from the framework package gate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'

const example = resolve(import.meta.dirname, '..')
const repo = resolve(example, '../..')
const require = createRequire(resolve(example, 'package.json'))
const buildRoot = dirname(require.resolve('@angular/build/package.json'))
const { JavaScriptTransformer } = require(
  resolve(
    buildRoot,
    'src/tools/javascript-transformer/javascript-transformer.js',
  ),
)
const transformer = new JavaScriptTransformer({
  sourcemap: false,
  advancedOptimizations: true,
  maxConcurrency: 1,
})
const { build } = require('esbuild')
const option = (name) =>
  process.argv
    .slice(2)
    .find((arg) => arg.startsWith(name + '='))
    ?.slice(name.length + 1)
const directory = resolve(
  option('--adapter-dir') ?? resolve(repo, 'packages/angular-charts/dist'),
  'fesm2022',
)
const primary = resolve(directory, 'tanstack-angular-charts.mjs')
const canvas = resolve(directory, 'tanstack-angular-charts-canvas.mjs')
const server = resolve(directory, 'tanstack-angular-charts-server.mjs')
const output = resolve(
  example,
  '.benchmark-output',
  option('--label') ?? 'angular-size',
)
await mkdir(output, { recursive: true })
const cases = {
  svg: `export { Chart } from '${primary}'`,
  svgWithTooltip: `export { Chart, ChartTooltipBodyDirective } from '${primary}'`,
  canvas: `export { Chart } from '${canvas}'`,
  both: `export { Chart as SvgChart } from '${primary}'; export { Chart as CanvasChart } from '${canvas}'`,
  directive: `export { ChartTooltipBodyDirective } from '${primary}'`,
  strategy: `export { CHART_SERVER_RENDER } from '${primary}'`,
  server: `export { provideChartsServerRendering } from '${server}'`,
}
const results = {}
try {
  for (const [name, contents] of Object.entries(cases)) {
    const result = await build({
      stdin: { contents, resolveDir: repo },
      write: false,
      bundle: true,
      minify: true,
      treeShaking: true,
      format: 'esm',
      target: 'es2022',
      define: {
        ngDevMode: 'false',
        ngJitMode: 'false',
        ngI18nClosureMode: 'false',
      },
      plugins: [
        {
          name: 'linked-apf',
          setup(builder) {
            builder.onResolve({ filter: /^[^./]/ }, (args) => ({
              path: args.path,
              external: true,
            }))
            builder.onLoad({ filter: /\.mjs$/ }, async ({ path }) => {
              if (!path.startsWith(directory + '/')) return
              const source = await readFile(path, 'utf8')
              const linked = await transformer.transformData(path, source, {
                sideEffects: async () => false,
              })
              return {
                contents: new TextDecoder().decode(linked),
                loader: 'js',
              }
            })
          },
        },
      ],
    })
    const code = result.outputFiles[0].text
    if (
      !process.argv.includes('--baseline') &&
      ['svg', 'canvas', 'both', 'strategy', 'server'].includes(name)
    )
      assert.ok(
        !code.includes('ts-chart-tooltip__title'),
        name + ': custom Angular tooltip rendering must be dropped',
      )
    if (
      name === 'svgWithTooltip' ||
      (name === 'directive' && !process.argv.includes('--baseline'))
    )
      assert.ok(
        code.includes('ts-chart-tooltip__title'),
        name + ': custom Angular tooltip rendering must be retained',
      )
    const bytes = result.outputFiles[0].contents
    assert.ok(!result.outputFiles[0].text.includes('ngDeclare'))
    if (name === 'directive' || name === 'strategy' || name === 'server')
      assert.ok(
        !result.outputFiles[0].text.includes('ts-chart-host'),
        'Utility-only bundles must drop chart components',
      )
    results[name] = {
      raw: bytes.length,
      gzip: gzipSync(bytes, { level: 9 }).length,
      brotli: brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
    }
    await writeFile(resolve(output, name + '.mjs'), bytes)
  }
} finally {
  await transformer.close()
}
// APF identity matters for both-component consumers: independently linked entries
// contain private helper/template copies even though primary tokens are shared.
const { execFileSync } = await import('node:child_process')
const summary = {
  date: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repo,
    encoding: 'utf8',
  }).trim(),
  angular: require('@angular/core/package.json').version,
  adapterDirectory: directory,
  method:
    'Angular CLI-linked/optimized APF; minified ES2022; all bare Angular/chart imports external; gzip 9; Brotli 11. Public exports are retained; svgWithTooltip includes the actual directive and renderer.',
  results,
}
await writeFile(
  resolve(output, 'sizes.json'),
  JSON.stringify(summary, null, 2) + '\n',
)
console.log(JSON.stringify(summary, null, 2))
