import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { defineChart, lineY } from '@tanstack/charts'
import { Chart } from '@tanstack/charts/angular'
import type { ChartOptions } from '@tanstack/charts/angular'
import { scaleLinear } from 'd3-scale'

const revenue = [
  { month: 1, value: 42 },
  { month: 2, value: 55 },
  { month: 3, value: 48 },
  { month: 4, value: 72 },
  { month: 5, value: 68 },
]

const definition = defineChart({
  marks: [lineY(revenue, { x: 'month', y: 'value' })],
  x: { scale: scaleLinear().domain([1, 5]) },
  y: { scale: scaleLinear().domain([0, 80]) },
})

@Component({
  selector: 'app-root',
  imports: [Chart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Angular revenue chart</h1>
      <tanstack-chart [options]="options()" />
    </main>
  `,
})
export class App {
  readonly options = signal<ChartOptions<(typeof revenue)[number]>>({
    definition,
    class: 'revenue-chart',
    height: 320,
    ariaLabel: 'Monthly revenue',
  })
}
