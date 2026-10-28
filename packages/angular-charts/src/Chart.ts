import {
  ChangeDetectionStrategy,
  Component,
  ViewContainerRef,
  ViewEncapsulation,
  computed,
  contentChild,
  input,
  inject,
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
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import { chartHostBindings, chartHostTemplate } from './chart-host'
import { injectChartHost } from './inject-chart-host'
import { CHART_SERVER_RENDER } from './chart-server-render'
import { SvgChartTooltipBodyComponent } from './SvgChartTooltipBodyComponent'
import type { ChartOptions } from './types'

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
  protected readonly tooltipBodyDirective = contentChild<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  >(ChartTooltipBodyDirective)
  protected readonly tooltipOutlet = viewChild.required('tooltipOutlet', {
    read: ViewContainerRef,
  })
  readonly #renderSvg = computed(
    () => this.options().renderSvg ?? renderChartSvg,
  )
  readonly #renderer = computed(() =>
    createSvgChartRenderer<TDatum, TXValue, TYValue>(this.#renderSvg()),
  )
  readonly #rendererOptions = computed(() => {
    const { renderSvg: _renderSvg, onRender, ...options } = this.options()
    return {
      ...options,
      renderer: this.#renderer(),
      onRender: (
        context: ChartRendererRenderContext<TDatum, TXValue, TYValue>,
      ) => {
        const svg = context.surface.defaultElement ?? context.surface.element
        const SvgElement =
          context.container.ownerDocument.defaultView?.SVGSVGElement
        if (!SvgElement || !(svg instanceof SvgElement))
          throw new TypeError('Expected the SVG chart surface.')
        const rendered = { ...context, svg }
        onRender?.(rendered)
        this.rendered.emit(rendered)
      },
    }
  })
  protected readonly host = injectChartHost({
    serverRender: inject(CHART_SERVER_RENDER),
    options: this.#rendererOptions,
    surface: this.surface,
    tooltipOutlet: this.tooltipOutlet,
    tooltipDirective: this.tooltipBodyDirective,
    tooltipComponent: SvgChartTooltipBodyComponent<TDatum, TXValue, TYValue>,
    idNamespace: 'svg',
    focusChange: this.focusChange,
    focusGroupChange: this.focusGroupChange,
    pointSelect: this.pointSelect,
  })
}
