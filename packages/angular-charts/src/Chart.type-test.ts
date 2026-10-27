import { Component } from '@angular/core'
import { Chart } from './Chart'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import type { ChartOptions } from './types'
import type { ChartPoint, ChartRenderContext } from '@tanstack/charts'

interface Datum {
  id: string
  x: number
  y: number
}

@Component({
  imports: [Chart, ChartTooltipBodyDirective],
  template: `
    <div
      tanstack-chart
      [options]="options"
      (rendered)="onRender($event)"
      (focusChange)="selectedId = $event?.datum?.id"
      (focusGroupChange)="onGroup($event)"
      (pointSelect)="selectedId = $event?.datum?.id"
    >
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
  protected options!: ChartOptions<Datum, number, number>
  protected selectedId: string | undefined
  protected onRender(context: ChartRenderContext<Datum, number, number>) {
    context.scene.points[0]?.xValue.toFixed(2)
  }
  protected onGroup(points: readonly ChartPoint<Datum, number, number>[]) {
    points[0]?.yValue.toFixed(2)
  }
}
void TooltipTypeTest

// Host presentation belongs to native bindings, and SVG presentation has an explicit name.
function checkPresentation(options: ChartOptions<Datum, number, number>) {
  options.svgClass = 'series-chart'
  // @ts-expect-error Host classes are native Angular bindings.
  options.class = 'host'
  // @ts-expect-error Host styles are native Angular bindings.
  options.style = 'height: 240px'
  // @ts-expect-error Use svgClass for the root SVG.
  options.className = 'surface'
}
void checkPresentation
