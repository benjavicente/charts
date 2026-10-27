import {
  Component,
  PendingTasks,
  inject,
  destroyPlatform,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import {
  provideServerRendering,
  renderApplication,
} from '@angular/platform-server'
import { ChartComponent } from '@tanstack/charts/angular'
import { describe, expect, it } from 'vitest'
import { createRevenueChart, revenueData } from './comparison-charts'

let browserMounts = 0

@Component({
  selector: 'server-chart',
  standalone: true,
  imports: [ChartComponent],
  template:
    '<div tanstack-chart id="server-revenue" [options]="options()"></div>',
})
class ServerChart {
  readonly options = signal({
    definition: createRevenueChart(revenueData),
    height: 260,
    ariaLabel: 'Server revenue',
    onRender: () => {
      browserMounts++
    },
  })
}

@Component({
  selector: 'async-server-chart',
  standalone: true,
  imports: [ChartComponent],
  template: '<div tanstack-chart [options]="options()"></div>',
})
class AsyncServerChart extends ServerChart {
  constructor() {
    super()
    const complete = inject(PendingTasks).add()
    setTimeout(() => {
      this.options.update((options) => ({
        ...options,
        height: 180,
        ariaLabel: 'Final server revenue',
      }))
      complete()
    }, 0)
  }
}

describe('signal Angular SSR', () => {
  it('emits complete SVG without mounting the browser runtime', async () => {
    browserMounts = 0
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          ServerChart,
          {
            providers: [
              provideZonelessChangeDetection(),
              provideServerRendering(),
            ],
          },
          context,
        ),
      {
        document:
          '<!doctype html><html><body><server-chart></server-chart></body></html>',
      },
    )
    expect(browserMounts).toBe(0)
    expect(html).toContain('<svg')
    expect(html).toContain('class="ts-chart__line"')
    expect(html).toContain('aria-label="Server revenue"')
    expect(html).toContain('id="server-revenue"')
  })

  it('serializes late options before SSR becomes stable', async () => {
    browserMounts = 0
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          AsyncServerChart,
          {
            providers: [
              provideZonelessChangeDetection(),
              provideServerRendering(),
            ],
          },
          context,
        ),
      {
        document:
          '<!doctype html><html><body><async-server-chart></async-server-chart></body></html>',
      },
    )
    expect(browserMounts).toBe(0)
    expect(html).toContain('aria-label="Final server revenue"')
    expect(html).not.toContain('aria-label="Server revenue"')
    expect(html).toContain('viewBox="0 0 640 180"')
  })
})
