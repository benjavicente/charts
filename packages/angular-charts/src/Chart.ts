import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  TemplateRef,
  ViewContainerRef,
  ViewEncapsulation,
  contentChild,
  input,
  viewChild,
} from '@angular/core'
import type { ChartValue } from '@tanstack/charts'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import { injectChartRenderer } from './injectChartRenderer'
import { injectChartTooltipBody } from './injectChartTooltipBody'
import type { ChartOptions } from './types'

@Component({
  selector: 'tanstack-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="ts-chart-host" [class]="options().class" [style]="hostStyle()">
      <div
        #surface
        class="ts-chart-surface"
        style="width: 100%; height: 100%"
        [innerHTML]="initialMarkup()"
      ></div>
    </div>
    <ng-container #tooltipOutlet></ng-container>
    <ng-content select="ng-template[tanstackChartTooltipBody]" />
    <ng-template #defaultTooltipBody>
      @if (defaultTooltipText() !== undefined) {
        {{ defaultTooltipText() }}
      } @else if (defaultTooltipContent(); as content) {
        @if (content.title) {
          <div
            class="ts-chart-tooltip__title"
            style="display:flex;align-items:center;gap:0.4rem;font-weight:650"
            [style.margin-bottom]="content.rows.length ? '0.3rem' : '0'"
          >
            @if (content.color) {
              <span
                class="ts-chart-tooltip__swatch"
                aria-hidden="true"
                style="display:block;width:0.55rem;height:0.55rem;border-radius:0.15rem;box-shadow:inset 0 0 0 1px rgb(0 0 0/.12)"
                [style.background]="content.color"
              ></span>
            }
            {{ content.title }}
          </div>
        }
        @if (content.rows.length) {
          <div class="ts-chart-tooltip__rows" aria-hidden="true">
            @for (row of content.rows; track $index) {
              <div
                class="ts-chart-tooltip__row"
                style="display:grid;grid-template-columns:0.55rem minmax(0,1fr) auto;align-items:center;column-gap:0.4rem"
              >
                @if (row.color) {
                  <span
                    class="ts-chart-tooltip__swatch"
                    aria-hidden="true"
                    style="display:block;width:0.55rem;height:0.55rem;border-radius:0.15rem;box-shadow:inset 0 0 0 1px rgb(0 0 0/.12)"
                    [style.background]="row.color"
                  ></span>
                } @else {
                  <span></span>
                }
                <span>{{ row.label }}</span>
                <span
                  style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap"
                  >{{ row.value }}</span
                >
              </div>
            }
          </div>
        }
      }
    </ng-template>
  `,
})
export class Chart<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> {
  readonly options = input.required<ChartOptions<TDatum, TXValue, TYValue>>()

  protected readonly surface =
    viewChild.required<ElementRef<HTMLElement>>('surface')
  protected readonly tooltipOutlet = viewChild.required('tooltipOutlet', {
    read: ViewContainerRef,
  })
  protected readonly defaultTooltipBody =
    viewChild.required<TemplateRef<unknown>>('defaultTooltipBody')
  protected readonly tooltipBodyDirective = contentChild<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  >(ChartTooltipBodyDirective)

  readonly #tooltipBody = injectChartTooltipBody({
    directive: this.tooltipBodyDirective,
    outlet: this.tooltipOutlet,
    defaultBody: this.defaultTooltipBody,
  })
  readonly #rendering = injectChartRenderer({
    chartOptions: this.options,
    surface: this.surface,
    tooltipBody: this.tooltipBodyDirective,
    onTooltipBodyChange: this.#tooltipBody.onTargetChange,
  })

  protected readonly initialMarkup = this.#rendering.initialMarkup
  protected readonly hostStyle = this.#rendering.hostStyle
  protected readonly defaultTooltipContent =
    this.#tooltipBody.defaultTooltipContent
  protected readonly defaultTooltipText = this.#tooltipBody.defaultTooltipText
}
