import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  contentChild,
  input,
  output,
  viewChild,
} from '@angular/core'
import type { ElementRef } from '@angular/core'
import { canvasChartRenderer } from '@tanstack/charts/canvas'
import type {
  ChartPoint,
  ChartRenderer,
  ChartRendererRenderContext,
  ChartValue,
} from '@tanstack/charts'
import { CHART_TOOLTIP_BODY } from './tooltip/chart-tooltip-body-token'
import type { ChartTooltipBodyRenderer } from './tooltip/chart-tooltip-body-token'
import { chartHostBindings, chartHostTemplate } from './host/chart-host'
import { injectChartHost } from './host/inject-chart-host'
import type { CanvasChartOptions as ChartOptions } from './canvas-types'

function canvasRenderer<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(): ChartRenderer<TDatum, TXValue, TYValue> {
  return canvasChartRenderer
}

function canvasRenderContext<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(context: ChartRendererRenderContext<TDatum, TXValue, TYValue>) {
  return context
}

@Component({
  selector: 'div[tanstack-canvas-chart]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: chartHostBindings,
  template: chartHostTemplate,
})
export class CanvasChart<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> {
  readonly options = input.required<ChartOptions<TDatum, TXValue, TYValue>>()
  readonly rendered =
    output<ChartRendererRenderContext<TDatum, TXValue, TYValue>>()
  readonly focusChange = output<ChartPoint<TDatum, TXValue, TYValue> | null>()
  readonly focusGroupChange =
    output<readonly ChartPoint<TDatum, TXValue, TYValue>[]>()
  readonly pointSelect = output<ChartPoint<TDatum, TXValue, TYValue> | null>()
  protected readonly surface = viewChild<ElementRef<HTMLElement>>('surface')
  protected readonly tooltipBody =
    contentChild<ChartTooltipBodyRenderer<TDatum, TXValue, TYValue>>(
      CHART_TOOLTIP_BODY,
    )
  protected readonly host = injectChartHost(this, {
    id: 'canvas',
    surface: this.surface,
    tooltipBody: this.tooltipBody,
    renderer: canvasRenderer<TDatum, TXValue, TYValue>,
    toRenderContext: canvasRenderContext<TDatum, TXValue, TYValue>,
  })
}
