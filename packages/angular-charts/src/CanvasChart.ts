import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  contentChild,
  input,
  inject,
  output,
  viewChild,
} from '@angular/core'
import type { ElementRef } from '@angular/core'
import { canvasChartRenderer } from '@tanstack/charts/canvas'
import type {
  ChartPoint,
  ChartRendererRenderContext,
  ChartValue,
} from '@tanstack/charts'
import { CHART_TOOLTIP_BODY } from './tooltip/chart-tooltip-body-token'
import type { ChartTooltipBodyRenderer } from './tooltip/chart-tooltip-body-token'
import { CHART_SERVER_RENDER } from './server/chart-server-render'
import { chartHostBindings, chartHostTemplate } from './host/chart-host'
import { injectChartHost } from './host/inject-chart-host'
import type { CanvasChartOptions as ChartOptions } from './canvas-types'

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
  readonly #rendererOptions = computed(() => {
    const { onRender, ...options } = this.options()
    return {
      ...options,
      renderer: canvasChartRenderer,
      onRender: (
        context: ChartRendererRenderContext<TDatum, TXValue, TYValue>,
      ) => {
        onRender?.(context)
        this.rendered.emit(context)
      },
    }
  })
  protected readonly host = injectChartHost({
    serverRender: inject(CHART_SERVER_RENDER),
    options: this.#rendererOptions,
    surface: this.surface,
    tooltipBody: this.tooltipBody,
    idNamespace: 'canvas',
    focusChange: this.focusChange,
    focusGroupChange: this.focusGroupChange,
    pointSelect: this.pointSelect,
  })
}
