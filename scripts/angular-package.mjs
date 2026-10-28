import assert from 'node:assert/strict'
import {
  readFile,
  readdir,
  rm,
  writeFile,
  mkdtemp,
  mkdir,
  copyFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve, relative, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

/** Finalize the multi-entry partial-Ivy build for both published package names. */
export async function finalizeAngularPackage(packageRoot) {
  const root = resolve(packageRoot, 'dist')
  const types = resolve(root, 'types')
  await mkdir(types, { recursive: true })
  // Analog emits declarations on demand for runtime-loaded modules. Emit the
  // complete public type graph, including modules containing only type exports.
  const require = createRequire(resolve(packageRoot, 'package.json'))
  const {
    readConfiguration,
    createCompilerHost,
    performCompilation,
    EmitFlags,
    formatDiagnostics,
  } = await import(pathToFileURL(require.resolve('@angular/compiler-cli')))
  const sourceRoot = resolve(packageRoot, 'src')
  const { rootNames, options, errors } = readConfiguration(
    resolve(packageRoot, 'tsconfig.lib.json'),
    { declaration: true, rootDir: sourceRoot, outDir: types },
  )
  assert.equal(errors.length, 0, formatDiagnostics(errors))
  const host = createCompilerHost({ options })
  const originalWrite = host.writeFile.bind(host)
  host.writeFile = (_path, data, _bom, _onError, sourceFiles) => {
    const source = sourceFiles?.[0]
    if (!source) return
    const path = relative(sourceRoot, source.fileName)
    if (path.startsWith('..')) return
    const target = resolve(types, path.replace(/\.ts$/, '.d.ts'))
    // Compiler writes are synchronous; its host handles directory creation.
    originalWrite(
      target,
      data.replace(
        /(from ['"])(\.[^'"]+)(['"])/g,
        (_, prefix, path, quote) =>
          prefix + (path.endsWith('.js') ? path : path + '.js') + quote,
      ),
      false,
    )
  }
  const result = performCompilation({
    rootNames,
    options,
    host,
    emitFlags: EmitFlags.DTS,
  })
  const failures = result.diagnostics.filter(
    (diagnostic) => diagnostic.category === 1,
  )
  assert.equal(failures.length, 0, formatDiagnostics(failures))
  for (const [entry, source] of [
    ['tanstack-angular-charts', 'index'],
    ['tanstack-angular-charts-canvas', 'canvas'],
    ['tanstack-angular-charts-server', 'server'],
  ])
    await writeFile(
      resolve(types, entry + '.d.ts'),
      `export * from './${source}.js'\n`,
    )
  const manifest = JSON.parse(
    await readFile(resolve(packageRoot, 'package.json'), 'utf8'),
  )
  const exports = Object.fromEntries(
    Object.entries(manifest.publishConfig.exports).map(([key, conditions]) => [
      key,
      Object.fromEntries(
        Object.entries(conditions).map(([condition, path]) => [
          condition,
          path.replace('./dist/', './'),
        ]),
      ),
    ]),
  )
  await writeFile(
    resolve(root, 'package.json'),
    JSON.stringify(
      {
        name: manifest.name,
        version: manifest.version,
        type: 'module',
        sideEffects: false,
        exports,
        peerDependencies: manifest.peerDependencies,
        peerDependenciesMeta: manifest.peerDependenciesMeta,
      },
      null,
      2,
    ) + '\n',
  )
  for (const name of ['README.md', 'LICENSE'])
    await copyFile(resolve(packageRoot, name), resolve(root, name))
}

/** Exercise emitted APF entries together, including Angular's component-ID checks. */
export async function verifyAngularPackage(packageRoot) {
  const { build } = await import('esbuild')
  const require = createRequire(resolve(packageRoot, 'package.json'))
  const temporary = await mkdtemp(resolve(tmpdir(), 'charts-angular-entries-'))
  const output = resolve(temporary, 'entries.mjs')
  const root = resolve(packageRoot, 'dist/fesm2022')
  async function files(directory, extension) {
    const entries = await readdir(directory, { withFileTypes: true })
    const parts = await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(resolve(directory, entry.name), extension)
          : entry.name.endsWith(extension)
            ? [resolve(directory, entry.name)]
            : [],
      ),
    )
    return parts.flat()
  }
  const declarations = new Set(
    await files(resolve(packageRoot, 'dist/types'), '.d.ts'),
  )
  for (const path of declarations) {
    const source = await readFile(path, 'utf8')
    for (const match of source.matchAll(
      /(?:from\s*|import\s*\()['"](\.[^'"]+)['"]/g,
    )) {
      const target = resolve(
        dirname(path),
        match[1].replace(/\.js$/, '') + '.d.ts',
      )
      assert.ok(
        declarations.has(target),
        `${relative(packageRoot, path)} references missing declaration ${match[1]}`,
      )
    }
  }
  const browserGraph = await build({
    stdin: {
      contents: `export { Chart } from ${JSON.stringify(resolve(root, 'tanstack-angular-charts.mjs'))}; export { Chart as CanvasChart } from ${JSON.stringify(resolve(root, 'tanstack-angular-charts-canvas.mjs'))};`,
      resolveDir: packageRoot,
    },
    bundle: true,
    write: false,
    metafile: true,
    packages: 'external',
    format: 'esm',
    logLevel: 'silent',
  })
  assert.ok(
    Object.values(browserGraph.metafile.inputs).every((input) =>
      input.imports.every((item) => item.path !== '@angular/platform-server'),
    ),
    'Browser entry graph must exclude platform-server',
  )
  const emitted = await Promise.all(
    (await files(root, '.mjs')).map((path) => readFile(path, 'utf8')),
  )
  assert.equal(
    emitted.filter((source) => /class ChartTooltipBodyComponent\b/.test(source))
      .length,
    1,
    'All entries must share one tooltip component definition',
  )
  assert.ok(
    emitted.some((source) => source.includes('ɵɵngDeclareComponent')),
    'Publish partial-Ivy declarations',
  )
  assert.ok(
    emitted.every((source) => !source.includes('ɵɵdefineComponent')),
    'Do not publish version-bound full-Ivy definitions',
  )
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
