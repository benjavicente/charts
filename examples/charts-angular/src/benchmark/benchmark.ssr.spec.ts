import {
  Component,
  destroyPlatform,
  provideZonelessChangeDetection,
} from '@angular/core'
import type { Type } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { renderApplication } from '@angular/platform-server'
import { defineChart, lineY } from '@tanstack/charts'
import type { ChartOptions } from '@tanstack/charts/angular'
import { Chart as NewChart } from '@benchmark/new-chart'
import { Chart as OldChart } from '@benchmark/old-chart'
import { scaleLinear } from 'd3-scale'
import { describe, expect, it } from 'vitest'

const rows = Array.from({ length: 80 }, (_, index) => ({
  x: index,
  y: 40 + Math.sin(index / 6) * 25,
}))
const definition = defineChart({
  marks: [lineY(rows, { x: 'x', y: 'y' })],
  x: { scale: scaleLinear().domain([0, rows.length - 1]) },
  y: { scale: scaleLinear().domain([0, 80]) },
})
const options: ChartOptions<(typeof rows)[number]> = {
  definition,
  width: 420,
  height: 240,
  ariaLabel: 'SSR benchmark chart',
}

@Component({
  selector: 'app-old-ssr-benchmark',
  imports: [OldChart],
  template: `
    @for (_ of charts; track $index) {
      <tanstack-chart [options]="options" />
    }
  `,
})
class OldHost {
  readonly charts = Array.from({ length: 24 })
  readonly options = options
}

@Component({
  selector: 'app-modern-ssr-benchmark',
  imports: [NewChart],
  template: `
    @for (_ of charts; track $index) {
      <tanstack-chart [options]="options" />
    }
  `,
})
class ModernHost {
  readonly charts = Array.from({ length: 24 })
  readonly options = options
}

describe('Angular adapter SSR performance', () => {
  it('compares main with the modern signal implementation', async () => {
    destroyPlatform()
    const old: number[] = []
    const modern: number[] = []
    for (let index = 0; index < 4; index += 1) {
      await render(index % 2 ? ModernHost : OldHost)
    }
    for (let index = 0; index < 16; index += 1) {
      const order =
        index % 2 === 0
          ? ([
              ['old', OldHost],
              ['modern', ModernHost],
            ] as const)
          : ([
              ['modern', ModernHost],
              ['old', OldHost],
            ] as const)
      for (const [name, host] of order) {
        const sample = await render(host)
        ;(name === 'old' ? old : modern).push(sample)
      }
    }
    const oldMedian = median(old) / 24
    const modernMedian = median(modern) / 24
    const result = {
      batchSize: 24,
      trials: 16,
      oldMsPerChart: oldMedian,
      modernMsPerChart: modernMedian,
      modernVsOldPercent: ((modernMedian - oldMedian) / oldMedian) * 100,
      caveat:
        'The old adapter mounts during Angular 20 server rendering; the modern adapter remains prerender-only.',
    }
    console.log(`ANGULAR_SSR_BENCHMARK ${JSON.stringify(result)}`)
    expect(old).toHaveLength(16)
    expect(modern).toHaveLength(16)
  }, 60_000)
})

async function render(host: Type<unknown>) {
  const start = performance.now()
  const selector =
    host === OldHost ? 'app-old-ssr-benchmark' : 'app-modern-ssr-benchmark'
  const serverDocument = document.implementation.createHTMLDocument()
  serverDocument.body.innerHTML = `<${selector}></${selector}>`
  Object.assign(serverDocument, {
    serialize: () =>
      `<!doctype html>${serverDocument.documentElement.outerHTML}`,
  })
  const html = await renderApplication(
    (context) =>
      bootstrapApplication(
        host,
        { providers: [provideZonelessChangeDetection()] },
        context,
      ),
    {
      document: serverDocument,
    },
  )
  expect(html.match(/<svg/g)).toHaveLength(24)
  return performance.now() - start
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}
