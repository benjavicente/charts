import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  createComponent,
  inject,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core'
import type { Type } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { defineChart, lineY } from '@tanstack/charts'
import type { ChartOptions } from '@tanstack/charts/angular'
import { Chart as NewChart } from '@benchmark/new-chart'
import { Chart as OldChart } from '@benchmark/old-chart'
import { scaleLinear } from 'd3-scale'

declare global {
  interface Window {
    runAngularChartBenchmark: () => Promise<BenchmarkResult>
  }
}

interface Samples {
  mount: number[]
  update: number[]
  destroy: number[]
  total: number[]
}

interface Summary {
  mountMsPerChart: number
  updateMsPerChart: number
  destroyMsPerChart: number
  totalMsPerChart: number
}

interface BenchmarkResult {
  environment: string
  batchSize: number
  updateRounds: number
  trials: number
  old: Summary
  modern: Summary
  modernVsOldPercent: Record<keyof Summary, number>
}

const rows = Array.from({ length: 80 }, (_, index) => ({
  x: index,
  y: 40 + Math.sin(index / 6) * 25,
}))
const definition = defineChart({
  marks: [lineY(rows, { x: 'x', y: 'y' })],
  x: { scale: scaleLinear().domain([0, rows.length - 1]) },
  y: { scale: scaleLinear().domain([0, 80]) },
})
const baseOptions: ChartOptions<(typeof rows)[number]> = {
  definition,
  width: 420,
  height: 240,
  ariaLabel: 'Benchmark chart',
}

@Component({
  selector: 'app-benchmark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Angular adapter benchmark</h1>
      <button type="button" (click)="runFromUi()">Run benchmark</button>
      <pre id="benchmark-result">{{ result() }}</pre>
    </main>
  `,
})
class BenchmarkApp {
  readonly result = signal('Ready')
  private readonly applicationRef = inject(ApplicationRef)
  private readonly environmentInjector = inject(EnvironmentInjector)

  constructor() {
    window.runAngularChartBenchmark = async () => {
      const result = await this.run()
      this.result.set(JSON.stringify(result, null, 2))
      return result
    }
  }

  async runFromUi() {
    this.result.set('Running…')
    const result = await this.run()
    this.result.set(JSON.stringify(result, null, 2))
  }

  private async run(): Promise<BenchmarkResult> {
    const batchSize = 24
    const updateRounds = 6
    const trials = 20
    const old = emptySamples()
    const modern = emptySamples()

    for (let index = 0; index < 6; index += 1) {
      await this.trial(index % 2 ? NewChart : OldChart, batchSize, updateRounds)
    }
    for (let index = 0; index < trials; index += 1) {
      const order =
        index % 2 === 0
          ? ([
              ['old', OldChart],
              ['modern', NewChart],
            ] as const)
          : ([
              ['modern', NewChart],
              ['old', OldChart],
            ] as const)
      for (const [name, implementation] of order) {
        const sample = await this.trial(implementation, batchSize, updateRounds)
        const target = name === 'old' ? old : modern
        target.mount.push(sample.mount)
        target.update.push(sample.update)
        target.destroy.push(sample.destroy)
        target.total.push(sample.total)
      }
    }

    const oldSummary = summarize(old, batchSize, updateRounds)
    const modernSummary = summarize(modern, batchSize, updateRounds)
    return {
      environment: navigator.userAgent,
      batchSize,
      updateRounds,
      trials,
      old: oldSummary,
      modern: modernSummary,
      modernVsOldPercent: Object.fromEntries(
        (Object.keys(oldSummary) as (keyof Summary)[]).map((key) => [
          key,
          ((modernSummary[key] - oldSummary[key]) / oldSummary[key]) * 100,
        ]),
      ) as Record<keyof Summary, number>,
    }
  }

  private async trial(
    implementation: Type<unknown>,
    batchSize: number,
    updateRounds: number,
  ) {
    await Promise.resolve()
    const refs = []
    const hosts: HTMLElement[] = []
    const totalStart = performance.now()
    const mountStart = performance.now()
    for (let index = 0; index < batchSize; index += 1) {
      const host = document.createElement('div')
      document.body.append(host)
      hosts.push(host)
      const ref = createComponent(implementation, {
        environmentInjector: this.environmentInjector,
        hostElement: host,
      })
      this.applicationRef.attachView(ref.hostView)
      ref.setInput('options', baseOptions)
      ref.changeDetectorRef.detectChanges()
      refs.push(ref)
    }
    this.applicationRef.tick()
    const mount = performance.now() - mountStart
    if (
      hosts.reduce(
        (count, host) => count + host.querySelectorAll('svg').length,
        0,
      ) !== batchSize
    ) {
      throw new Error('Every benchmark component must mount one SVG.')
    }

    const updateStart = performance.now()
    for (let round = 0; round < updateRounds; round += 1) {
      for (const ref of refs) {
        ref.setInput('options', {
          ...baseOptions,
          ariaLabel: `Benchmark chart ${round}`,
        })
      }
      this.applicationRef.tick()
    }
    const update = performance.now() - updateStart

    const destroyStart = performance.now()
    for (const ref of refs) {
      this.applicationRef.detachView(ref.hostView)
      ref.destroy()
    }
    for (const host of hosts) host.remove()
    const destroy = performance.now() - destroyStart
    return {
      mount,
      update,
      destroy,
      total: performance.now() - totalStart,
    }
  }
}

function emptySamples(): Samples {
  return { mount: [], update: [], destroy: [], total: [] }
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

function summarize(
  samples: Samples,
  batchSize: number,
  updateRounds: number,
): Summary {
  return {
    mountMsPerChart: median(samples.mount) / batchSize,
    updateMsPerChart: median(samples.update) / batchSize / updateRounds,
    destroyMsPerChart: median(samples.destroy) / batchSize,
    totalMsPerChart: median(samples.total) / batchSize,
  }
}

bootstrapApplication(BenchmarkApp, {
  providers: [provideZonelessChangeDetection()],
}).catch((error: unknown) => console.error(error))
