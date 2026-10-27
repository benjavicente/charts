import { ChangeDetectionStrategy, Component } from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import type { ChartValue } from '@tanstack/charts'
import {
  ChartTooltipBody,
  chartTooltipBodyTemplate,
} from './chart-tooltip-body'

@Component({
  selector: 'div[tanstack-canvas-chart-tooltip-body]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet],
  host: { style: 'display: contents' },
  template: chartTooltipBodyTemplate,
})
export class CanvasChartTooltipBodyComponent<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> extends ChartTooltipBody<TDatum, TXValue, TYValue> {}
