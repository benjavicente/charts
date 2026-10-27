import { Component } from '@angular/core'
import type { ChartRendererRenderContext, ChartPoint } from '@tanstack/charts'
import { Chart, ChartTooltipBodyDirective } from './index'
import { CanvasChart } from './CanvasChart'
import type { CanvasChartOptions } from './canvas-types'

interface Datum {
  id: string
  x: number
  y: number
}
@Component({
  imports: [Chart, CanvasChart, ChartTooltipBodyDirective],
  template: `
    <div tanstack-chart [options]="options"></div>
    <div
      tanstack-canvas-chart
      [options]="options"
      (rendered)="onRender($event)"
      (focusChange)="selectedId = $event?.datum?.id"
      (focusGroupChange)="onGroup($event)"
      (pointSelect)="selectedId = $event?.datum?.id"
    >
      <ng-template [tanstackChartTooltipBody]="options.definition" let-tooltip>
        {{ tooltip.primaryPoint?.datum?.id }}
        @for (point of tooltip.points; track $index) {
          {{ point.xValue.toFixed(2) }}
        }
        <button (click)="tooltip.dismiss()">Dismiss</button>
      </ng-template>
    </div>
  `,
})
class CanvasTypeTest {
  protected options!: Omit<
    CanvasChartOptions<Datum, number, number>,
    'onRender'
  >
  protected selectedId: string | undefined
  protected onRender(
    context: ChartRendererRenderContext<Datum, number, number>,
  ) {
    context.surface.element.getBoundingClientRect()
    context.scene.points[0]?.xValue.toFixed(2)
    // @ts-expect-error A Canvas render context does not promise an SVG.
    context.svg
  }
  protected onGroup(points: readonly ChartPoint<Datum, number, number>[]) {
    points[0]?.yValue.toFixed(2)
  }
}
void CanvasTypeTest
function checkOptions(options: CanvasChartOptions<Datum, number, number>) {
  options.className = 'canvas-surface'
  options.onRender = (context) => {
    context.surface.element.getBoundingClientRect()
  }
  // @ts-expect-error Canvas selects its renderer.
  options.renderer = {}
  // @ts-expect-error SVG serialization belongs to the SVG entry.
  options.renderSvg = () => ''
  // @ts-expect-error Tooltip projection belongs to Angular.
  options.onTooltipBodyChange = () => {}
}
void checkOptions
