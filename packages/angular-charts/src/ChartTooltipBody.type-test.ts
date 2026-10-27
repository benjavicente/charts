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
    <tanstack-chart [options]="options">
      <ng-template [tanstackChartTooltipBody]="options.definition" let-tooltip>
        @for (point of tooltip.points; track $index) {
          {{ point.datum.id }}
        }
        <button
          type="button"
          [disabled]="!tooltip.pinned"
          (click)="tooltip.dismiss()"
        >
          Close
        </button>
      </ng-template>
    </tanstack-chart>
  `,
})
class ChartTooltipBodyTypeTest {
  protected options!: ChartOptions<Datum, number, number>
}

void ChartTooltipBodyTypeTest
