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
  for (const entry of ['canvas', 'server'])
    await rm(resolve(root, entry, 'package.json'), { force: true })
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
          import { reflectComponentType, createEnvironmentInjector, Injector, ErrorHandler, inject, runInInjectionContext } from '@angular/core';
          import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
          import { Chart, ChartTooltipBodyDirective, CHART_SERVER_RENDER } from ${JSON.stringify(resolve(root, 'tanstack-angular-charts.mjs'))};
          import { Chart as CanvasChart, ChartTooltipBodyDirective as CanvasDirective, CHART_SERVER_RENDER as CANVAS_SERVER_RENDER } from ${JSON.stringify(resolve(root, 'tanstack-angular-charts-canvas.mjs'))};
          import { provideChartsServerRendering } from ${JSON.stringify(resolve(root, 'tanstack-angular-charts-server.mjs'))};
          export const selectors = [reflectComponentType(Chart).selector, reflectComponentType(CanvasChart).selector];
          export const sharedDirective = ChartTooltipBodyDirective === CanvasDirective;
          export const sharedStrategy = CHART_SERVER_RENDER === CANVAS_SERVER_RENDER;
          export function exerciseServerStrategy(throwFromHandler = false) {
            const errors = [];
            const app = createEnvironmentInjector([
              provideChartsServerRendering(),
              provideChartsServerRendering(),
              { provide: ErrorHandler, useValue: { handleError: error => {
                errors.push(error.message);
                if (throwFromHandler) throw error;
              } } },
            ], Injector.NULL);
            const removed = createEnvironmentInjector([], app);
            const live = createEnvironmentInjector([], app);
            const calls = [];
            runInInjectionContext(removed, () => inject(CHART_SERVER_RENDER)(() => calls.push('removed')));
            runInInjectionContext(live, () => inject(CANVAS_SERVER_RENDER)(() => { throw Error('chart failed') }));
            runInInjectionContext(live, () => inject(CHART_SERVER_RENDER)(() => calls.push('live')));
            removed.destroy();
            const hooks = app.get(BEFORE_APP_SERIALIZED);
            let aborted = false;
            try {
              for (const hook of hooks) hook();
            } catch (error) {
              if (!throwFromHandler) throw error;
              aborted = true;
            }
            for (const hook of hooks) hook();
            live.destroy();
            app.destroy();
            return { calls, errors, aborted };
          }
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
    assert.equal(
      entries.sharedStrategy,
      true,
      'Renderer entries must share the SSR strategy token',
    )
    assert.deepEqual(entries.exerciseServerStrategy(), {
      calls: ['live'],
      errors: ['chart failed'],
      aborted: false,
    })
    assert.deepEqual(entries.exerciseServerStrategy(true), {
      calls: [],
      errors: ['chart failed'],
      aborted: true,
    })
    assert.deepEqual(
      warnings.filter((message) => message.includes('NG0912')),
      [],
      'Renderer entries must not duplicate Angular component IDs',
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
