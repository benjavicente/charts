import { DOCUMENT } from '@angular/common'
import {
  Component,
  InjectionToken,
  PendingTasks,
  inject,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import {
  BEFORE_APP_SERIALIZED,
  provideServerRendering,
  renderApplication,
} from '@angular/platform-server'
import { Chart, CHART_SERVER_RENDER } from '@tanstack/charts/angular'
import {
  Chart as CanvasChart,
  CHART_SERVER_RENDER as CANVAS_SERVER_RENDER,
} from '@tanstack/charts/angular/canvas'
import { provideChartsServerRendering } from '@tanstack/charts/angular/server'
import { renderChartSvg } from '@tanstack/charts/svg'
import type { ChartSvgRenderer } from '@tanstack/charts'
import type { ChartDefinition } from '@tanstack/charts/angular'
import { describe, expect, it } from 'vitest'
import { createRevenueChart, revenueData } from './comparison-charts'
import type { RevenueDatum } from './comparison-charts'

interface Probe {
  mode: 'none' | 'callback' | 'data' | 'destroy'
  calls: string[]
  values: number[]
  prepared?: number[]
  includeRemoved?: boolean
  before?: { svg: boolean; canvas: boolean }
}

const PROBE = new InjectionToken<Probe>('')

function definition(
  probe: Probe,
  rows = revenueData,
): ChartDefinition<RevenueDatum, number, number> {
  return {
    chart: () => {
      ;(probe.prepared ??= []).push(rows[0]?.revenue ?? 0)
      return createRevenueChart(rows)
    },
  }
}

@Component({
  selector: 'serialization-test',
  imports: [Chart, CanvasChart],
  template: `
    <div tanstack-chart [options]="options()"></div>
    <div tanstack-canvas-chart [options]="options()"></div>
    @if (showRemoved()) {
      <div tanstack-chart [options]="removedOptions"></div>
    }
  `,
})
class SerializationTest {
  readonly probe = inject(PROBE)
  readonly showRemoved = signal(this.probe.includeRemoved ?? false)
  readonly renderer: ChartSvgRenderer<RevenueDatum, number, number> = (
    scene,
    options,
  ) => {
    this.probe.calls.push(options.ariaLabel)
    this.probe.values.push(scene.points[0]?.datum.revenue ?? 0)
    return renderChartSvg(scene, options)
  }
  readonly options = signal({
    definition: definition(this.probe),
    height: 260,
    ariaLabel: 'Initial revenue',
    renderSvg: this.renderer,
    onFocusChange: () => {},
  })
  readonly removedOptions = {
    ...this.options(),
    ariaLabel: 'Removed chart',
  }

  constructor() {
    const complete = inject(PendingTasks).add()
    setTimeout(() => {
      if (this.probe.mode === 'callback') {
        this.options.update((options) => ({
          ...options,
          onFocusChange: () => {},
        }))
      } else if (this.probe.mode === 'data') {
        this.options.update((options) => ({
          ...options,
          height: 180,
          ariaLabel: 'Final revenue',
          definition: definition(
            this.probe,
            revenueData.map((datum) => ({ ...datum, revenue: 73 })),
          ),
        }))
      } else if (this.probe.mode === 'destroy') {
        this.showRemoved.set(false)
      }
      complete()
    }, 0)
  }
}

function render(probe: Probe, queued = true) {
  return renderApplication(
    (context) =>
      bootstrapApplication(
        SerializationTest,
        {
          providers: [
            provideZonelessChangeDetection(),
            provideServerRendering(),
            { provide: PROBE, useValue: probe },
            {
              provide: BEFORE_APP_SERIALIZED,
              multi: true,
              useFactory: () => {
                const document = inject(DOCUMENT)
                return () => {
                  probe.before = {
                    svg: !!document.querySelector('svg'),
                    canvas: !!document.querySelector('.ts-chart-canvas'),
                  }
                }
              },
            },
            ...(queued ? [provideChartsServerRendering()] : []),
          ],
        },
        context,
      ),
    {
      document:
        '<!doctype html><html><body><serialization-test></serialization-test></body></html>',
    },
  )
}

describe('server serialization strategy', () => {
  it('shares the strategy token between SVG and Canvas entries', () => {
    expect(CANVAS_SERVER_RENDER).toBe(CHART_SERVER_RENDER)
  })

  it('keeps effect-based SSR as the default without a server provider', async () => {
    const probe: Probe = { mode: 'callback', calls: [], values: [] }
    await render(probe, false)
    expect(probe.calls).toEqual(['Initial revenue', 'Initial revenue'])
    expect(probe.before).toEqual({ svg: true, canvas: true })
  })

  it('defers both renderers and serializes once, including callback-only updates', async () => {
    for (const mode of ['none', 'callback'] as const) {
      const probe: Probe = { mode, calls: [], values: [] }
      const html = await render(probe)
      expect(probe.calls).toEqual(['Initial revenue'])
      expect(probe.before).toEqual({ svg: false, canvas: false })
      expect(html).toContain('<svg')
      expect(html).toContain('ts-chart-canvas__scene')
    }
  })

  it('serializes final data, dimensions and accessibility for SVG and Canvas', async () => {
    const probe: Probe = { mode: 'data', calls: [], values: [] }
    const html = await render(probe)
    expect(probe.calls).toEqual(['Final revenue'])
    expect(probe.values).toEqual([73])
    expect(probe.prepared).toEqual([73, 73])
    expect(html).not.toContain('aria-label="Initial revenue"')
    expect(html.match(/aria-label="Final revenue"/g)).toHaveLength(2)
    expect(html).toContain('viewBox="0 0 640 180"')
    expect(html).toContain('data-ts-chart-height="180"')
  })

  it('does not render a chart destroyed before serialization', async () => {
    const probe: Probe = {
      mode: 'destroy',
      calls: [],
      values: [],
      includeRemoved: true,
    }
    const html = await render(probe)
    expect(probe.calls).toEqual(['Initial revenue'])
    expect(html).not.toContain('Removed chart')
  })

  it('keeps separate server applications isolated', async () => {
    const first: Probe = { mode: 'data', calls: [], values: [] }
    const second: Probe = { mode: 'none', calls: [], values: [] }
    await render(first)
    const html = await render(second)
    expect(first.calls).toEqual(['Final revenue'])
    expect(second.calls).toEqual(['Initial revenue'])
    expect(html).not.toContain('Final revenue')
  })

  it('isolates concurrent server applications', async () => {
    const first: Probe = { mode: 'data', calls: [], values: [] }
    const second: Probe = { mode: 'none', calls: [], values: [] }
    const [firstHtml, secondHtml] = await Promise.all([
      render(first),
      render(second),
    ])
    expect(first.calls).toEqual(['Final revenue'])
    expect(second.calls).toEqual(['Initial revenue'])
    expect(first.prepared).toEqual([73, 73])
    expect(second.prepared).toEqual([24, 24])
    expect(firstHtml).toContain('aria-label="Final revenue"')
    expect(secondHtml).not.toContain('Final revenue')
  })
})
