import {
  Component,
  destroyPlatform,
  provideZonelessChangeDetection,
} from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { renderApplication } from '@angular/platform-server'
import { defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/angular'
import type { ChartOptions } from '@tanstack/charts/angular'
import { scaleLinear } from 'd3-scale'
import { describe, expect, it } from 'vitest'

const rows = [
  { x: 0, y: 2 },
  { x: 1, y: 4 },
]

const definition = defineChart({
  marks: [lineY(rows, { x: 'x', y: 'y' })],
  x: { scale: scaleLinear().domain([0, 1]) },
  y: { scale: scaleLinear().domain([0, 4]) },
})

@Component({
  selector: 'app-server-chart',
  imports: [Chart],
  template: '<div tanstack-chart [options]="options"></div>',
})
class ServerChart {
  readonly options: ChartOptions<(typeof rows)[number]> = {
    definition,
    height: 260,
    ariaLabel: 'Server revenue',
  }
}

describe('Angular chart SSR', () => {
  it('renders complete SVG without a browser DOM mount', async () => {
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          ServerChart,
          { providers: [provideZonelessChangeDetection()] },
          context,
        ),
      {
        document:
          '<!doctype html><html><body><app-server-chart></app-server-chart></body></html>',
      },
    )

    expect(html).toContain('<svg')
    expect(html).toContain('class="ts-chart__line"')
    expect(html).toContain('aria-label="Server revenue"')
  })
})
