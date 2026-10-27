import { Component } from '@angular/core'
import { ChartComponent } from './ChartComponent'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import type { ChartComponentOptions } from './types'

interface Datum {
  id: string
  x: number
  y: number
}

@Component({
  standalone: true,
  imports: [ChartComponent, ChartTooltipBodyDirective],
  template: `
    <div tanstack-chart [options]="options">
      <ng-template [tanstackChartTooltipBody]="options.definition" let-tooltip>
        @if (tooltip.primaryPoint?.datum; as datum) {
          {{ datum.id }}
        }
        @for (point of tooltip.points; track $index) {
          {{ point.xValue.toFixed(2) }}
        }
        <button [disabled]="!tooltip.pinned" (click)="tooltip.dismiss()">
          Dismiss
        </button>
      </ng-template>
    </div>
  `,
})
class TooltipTypeTest {
  protected options!: ChartComponentOptions<Datum, number, number>
}
void TooltipTypeTest

// Host presentation belongs to native bindings, and SVG presentation has an explicit name.
function checkPresentation(
  options: ChartComponentOptions<Datum, number, number>,
) {
  options.svgClass = 'series-chart'
  // @ts-expect-error Host classes are native Angular bindings.
  options.class = 'host'
  // @ts-expect-error Host styles are native Angular bindings.
  options.style = 'height: 240px'
  // @ts-expect-error Use svgClass for the root SVG.
  options.className = 'surface'
}
void checkPresentation
