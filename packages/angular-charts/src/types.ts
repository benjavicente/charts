import type { TemplateRef } from '@angular/core'
import type {
  ChartHostCommonOptions,
  ChartHostOptions,
  ChartTooltipBodyContext,
  ChartValue,
} from '@tanstack/charts'

export interface ChartPresentationOptions {
  /** Extra class on the rendered root SVG. Bind host classes/styles in the template. */
  svgClass?: string
}

export interface ChartTooltipBodyRenderContext<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> extends ChartTooltipBodyContext<TDatum, TXValue, TYValue> {
  defaultBody: TemplateRef<unknown>
}

export interface ChartTooltipBodyTemplateContext<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> extends ChartTooltipBodyRenderContext<TDatum, TXValue, TYValue> {
  $implicit: ChartTooltipBodyRenderContext<TDatum, TXValue, TYValue>
}

export type ChartCommonOptions<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> = Omit<ChartHostCommonOptions<TDatum, TXValue, TYValue>, 'className'> &
  ChartPresentationOptions

export type ChartOptions<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> = Omit<ChartHostOptions<TDatum, TXValue, TYValue>, 'className'> &
  ChartPresentationOptions
