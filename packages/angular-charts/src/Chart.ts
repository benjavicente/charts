import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  contentChild,
  input,
  output,
  viewChild,
} from '@angular/core'
import type { ElementRef } from '@angular/core'
import { renderChartSvg } from '@tanstack/charts/svg'
import { createSvgChartRenderer } from '@tanstack/charts/svg/renderer'
import type {
  ChartPoint,
  ChartRenderContext,
  ChartRendererRenderContext,
  ChartValue,
} from '@tanstack/charts'
import { CHART_TOOLTIP_BODY } from './tooltip/chart-tooltip-body-token'
import type { ChartTooltipBodyRenderer } from './tooltip/chart-tooltip-body-token'
import { chartHostBindings, chartHostTemplate } from './host/chart-host'
import { injectChartHost } from './host/inject-chart-host'
import type { ChartOptions } from './types'

function svgRenderContext<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(
  context: ChartRendererRenderContext<TDatum, TXValue, TYValue>,
): ChartRenderContext<TDatum, TXValue, TYValue> {
  const svg = context.surface.defaultElement ?? context.surface.element
  const SvgElement = context.container.ownerDocument.defaultView?.SVGSVGElement
  if (!SvgElement || !(svg instanceof SvgElement))
    throw new TypeError('Expected the SVG chart surface.')
  return { ...context, svg }
}

@Component({
  selector: 'div[tanstack-chart]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: chartHostBindings,
  template: chartHostTemplate,
})
export class Chart<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> {
  readonly options = input.required<ChartOptions<TDatum, TXValue, TYValue>>()
  readonly rendered = output<ChartRenderContext<TDatum, TXValue, TYValue>>()
  readonly focusChange = output<ChartPoint<TDatum, TXValue, TYValue> | null>()
  readonly focusGroupChange =
    output<readonly ChartPoint<TDatum, TXValue, TYValue>[]>()
  readonly pointSelect = output<ChartPoint<TDatum, TXValue, TYValue> | null>()
  protected readonly surface = viewChild<ElementRef<HTMLElement>>('surface')
  protected readonly tooltipBody =
    contentChild<ChartTooltipBodyRenderer<TDatum, TXValue, TYValue>>(
      CHART_TOOLTIP_BODY,
    )
  // Equality on the render function keeps the renderer, and so the mounted
  // surface, stable across unrelated option updates.
  readonly #renderSvg = computed(
    () => this.options().renderSvg ?? renderChartSvg,
  )
  readonly #renderer = computed(() =>
    createSvgChartRenderer<TDatum, TXValue, TYValue>(this.#renderSvg()),
  )
  protected readonly host = injectChartHost(this, {
    id: 'svg',
    surface: this.surface,
    tooltipBody: this.tooltipBody,
    renderer: this.#renderer,
    toRenderContext: svgRenderContext<TDatum, TXValue, TYValue>,
  })
}
