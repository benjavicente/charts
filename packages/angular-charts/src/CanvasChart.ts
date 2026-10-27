import {
  ChangeDetectionStrategy,
  Component,
  ViewContainerRef,
  ViewEncapsulation,
  computed,
  contentChild,
  input,
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
import { ChartTooltipBodyDirective } from '@tanstack/angular-charts'
import { chartHostBindings, chartHostTemplate } from './chart-host'
import { injectChartHost } from './inject-chart-host'
import { CanvasChartTooltipBodyComponent } from './CanvasChartTooltipBodyComponent'
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
  protected readonly tooltipBodyDirective = contentChild<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  >(ChartTooltipBodyDirective)
  protected readonly tooltipOutlet = viewChild.required('tooltipOutlet', {
    read: ViewContainerRef,
  })
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
    options: this.#rendererOptions,
    surface: this.surface,
    tooltipOutlet: this.tooltipOutlet,
    tooltipDirective: this.tooltipBodyDirective,
    tooltipComponent: CanvasChartTooltipBodyComponent<TDatum, TXValue, TYValue>,
    idNamespace: 'canvas',
    focusChange: this.focusChange,
    focusGroupChange: this.focusGroupChange,
    pointSelect: this.pointSelect,
  })
}
