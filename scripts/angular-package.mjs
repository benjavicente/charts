import assert from 'node:assert/strict'
import { readFile, readdir, rm, writeFile, mkdtemp } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Make secondary entries portable when copied into the unified package. */
export async function finalizeAngularPackage(packageRoot) {
  const root = resolve(packageRoot, 'dist')
  for (const [directory, extension] of [
    ['fesm2022', '.mjs'],
    ['types', '.d.ts'],
  ]) {
    for (const name of await readdir(resolve(root, directory))) {
      if (!name.endsWith(extension)) continue
      const path = resolve(root, directory, name)
      const source = await readFile(path, 'utf8')
      const target =
        directory === 'types'
          ? './tanstack-angular-charts.js'
          : './tanstack-angular-charts.mjs'
      await writeFile(
        path,
        source.replace(
          /(['"])@tanstack\/angular-charts\1/g,
          (_, quote) => `${quote}${target}${quote}`,
        ),
      )
    }
  }
  // Explicit root exports locate the secondary entry; its APF proxy is redundant.
  await rm(resolve(root, 'canvas/package.json'), { force: true })
}

/** Exercise emitted APF entries together, including Angular's component-ID checks. */
export async function verifyAngularPackage(packageRoot) {
  const { build } = await import('esbuild')
  const require = createRequire(resolve(packageRoot, 'package.json'))
  const temporary = await mkdtemp(resolve(tmpdir(), 'charts-angular-entries-'))
  const output = resolve(temporary, 'entries.mjs')
  const root = resolve(packageRoot, 'dist/fesm2022')
  try {
    await build({
      stdin: {
        contents: `
          import '@angular/compiler';
          import { reflectComponentType } from '@angular/core';
          import { Chart, ChartTooltipBodyDirective } from ${JSON.stringify(resolve(root, 'tanstack-angular-charts.mjs'))};
          import { Chart as CanvasChart, ChartTooltipBodyDirective as CanvasDirective } from ${JSON.stringify(resolve(root, 'tanstack-angular-charts-canvas.mjs'))};
          export const selectors = [reflectComponentType(Chart).selector, reflectComponentType(CanvasChart).selector];
          export const sharedDirective = ChartTooltipBodyDirective === CanvasDirective;
        `,
        resolveDir: packageRoot,
      },
      outfile: output,
      bundle: true,
      format: 'esm',
      platform: 'node',
      logLevel: 'silent',
      plugins: [
        {
          name: 'angular-peers',
          setup(build) {
            build.onResolve({ filter: /^@angular\// }, ({ path }) => ({
              path: require.resolve(path),
              external: true,
            }))
          },
        },
      ],
    })
    const warnings = []
    const warn = console.warn
    let entries
    try {
      console.warn = (...args) => warnings.push(args.join(' '))
      entries = await import(pathToFileURL(output).href)
    } finally {
      console.warn = warn
    }
    assert.deepEqual(entries.selectors, [
      'div[tanstack-chart]',
      'div[tanstack-canvas-chart]',
    ])
    assert.equal(
      entries.sharedDirective,
      true,
      'Renderer entries must share the tooltip directive',
    )
    assert.deepEqual(
      warnings.filter((message) => message.includes('NG0912')),
      [],
      'Renderer entries must not duplicate Angular component IDs',
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
