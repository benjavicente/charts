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
import { Chart } from '@tanstack/charts/angular'
import { Chart as CanvasChart } from '@tanstack/charts/angular/canvas'
import { describe, expect, it } from 'vitest'
import { createRevenueChart, revenueData } from './comparison-charts'

let browserMounts = 0

@Component({
  selector: 'server-chart',
  imports: [Chart],
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
  imports: [Chart],
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

@Component({
  selector: 'hybrid-server-chart',
  imports: [Chart],
  template: '<div tanstack-chart [options]="options()"></div>',
})
class HybridServerChart extends ServerChart {
  constructor() {
    super()
    this.options.update((options) => ({
      ...options,
      definition: createRevenueChart(revenueData, true),
      className: 'hybrid-surface',
    }))
  }
}

@Component({
  selector: 'canvas-server-chart',
  imports: [CanvasChart],
  template:
    '<div tanstack-canvas-chart id="canvas-server" [options]="options()"></div>',
})
class CanvasServerChart extends ServerChart {
  constructor() {
    super()
    const complete = inject(PendingTasks).add()
    setTimeout(() => {
      this.options.update((options) => ({
        ...options,
        height: 180,
        className: 'canvas-server-surface',
        ariaLabel: 'Final Canvas revenue',
      }))
      complete()
    }, 0)
  }
}

describe('signal Angular SSR', () => {
  it('serializes the latest Canvas-only shell without mounting or requiring SVG', async () => {
    browserMounts = 0
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          CanvasServerChart,
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
          '<!doctype html><html><body><canvas-server-chart></canvas-server-chart></body></html>',
      },
    )
    expect(browserMounts).toBe(0)
    expect(html).not.toContain('<svg')
    expect(html).toContain(
      'class="ts-chart ts-chart-canvas canvas-server-surface"',
    )
    expect(html).toContain('aria-label="Final Canvas revenue"')
    expect(html).toContain('data-ts-chart-height="180"')
    expect(html).toContain('ts-chart-canvas__scene')
  })

  it('prerenders Canvas marks with className on the layered surface', async () => {
    browserMounts = 0
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          HybridServerChart,
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
          '<!doctype html><html><body><hybrid-server-chart></hybrid-server-chart></body></html>',
      },
    )
    expect(browserMounts).toBe(0)
    expect(html).toContain('class="ts-chart ts-chart-layers hybrid-surface"')
    expect(html).toContain('ts-chart-canvas__scene')
    expect(html).toContain('<svg class="ts-chart"')
    expect(html).not.toContain('<svg class="ts-chart hybrid-surface"')
  })

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
