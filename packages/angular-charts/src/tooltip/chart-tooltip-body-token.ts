import { InjectionToken } from '@angular/core'
import type { ChartTooltipBodyTarget, ChartValue } from '@tanstack/charts'

/** Internal projection contract; importing it does not retain Angular rendering. */
export interface ChartTooltipBodyRenderer<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> {
  render(target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null): void
}

export const CHART_TOOLTIP_BODY = new InjectionToken<ChartTooltipBodyRenderer>(
  '',
)
