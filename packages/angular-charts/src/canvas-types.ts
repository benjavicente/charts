import type {
  ChartRendererHostCommonOptions,
  ChartValue,
} from '@tanstack/charts'
import type { CanvasChartHostOptions } from '@tanstack/charts/canvas'

export type CanvasChartCommonOptions<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> = Omit<
  ChartRendererHostCommonOptions<TDatum, TXValue, TYValue>,
  'renderer' | 'onTooltipBodyChange'
>

export type CanvasChartOptions<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> = Omit<
  CanvasChartHostOptions<TDatum, TXValue, TYValue>,
  'onTooltipBodyChange'
>
