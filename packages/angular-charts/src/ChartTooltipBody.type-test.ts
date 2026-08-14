import { Component } from '@angular/core'
import type { ChartOptions } from './types'
import { Chart } from './Chart'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'

interface Datum {
  id: string
  x: number
  y: number
}

@Component({
  standalone: true,
  imports: [Chart, ChartTooltipBodyDirective],
  template: `
    <div tanstack-chart [options]="options">
      <ng-template [tanstackChartTooltipBody]="options.definition" let-tooltip>
        {{ tooltip.points[0]?.datum?.id }}
        <button
          type="button"
          [disabled]="!tooltip.pinned"
          (click)="tooltip.dismiss()"
        >
          Close
        </button>
      </ng-template>
    </div>
  `,
})
class ChartTooltipBodyTypeTest {
  protected options!: ChartOptions<Datum, number, number>
}

void ChartTooltipBodyTypeTest

export const chartTooltipBodyTypeTest = ChartTooltipBodyTypeTest
