import { Directive, input } from '@angular/core'
import type { TemplateRef } from '@angular/core'
import type {
  ChartTooltipBodyTarget,
  ChartTooltipContent,
  ChartValue,
} from '@tanstack/charts'
import type { ChartTooltipBodyTemplateContext } from './types'

export const chartTooltipBodyTemplate = `
    <ng-template #defaultBody>
      @let content = target().content;
      @if (isText(content)) {
        {{ content }}
      } @else {
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
                [attr.data-active]="row.active === true"
                [style.fontWeight]="
                  row.active
                    ? 'var(--ts-chart-tooltip-active-row-font-weight, 700)'
                    : null
                "
                [style.background]="
                  row.active
                    ? 'var(--ts-chart-tooltip-active-row-background, color-mix(in srgb, currentColor 12%, transparent))'
                    : null
                "
                [style.borderRadius]="
                  row.active
                    ? 'var(--ts-chart-tooltip-active-row-border-radius, .2rem)'
                    : null
                "
                [style.boxShadow]="
                  row.active
                    ? 'var(--ts-chart-tooltip-active-row-shadow, 0 0 0 2px color-mix(in srgb, currentColor 12%, transparent))'
                    : null
                "
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
    @if (template(); as body) {
      <ng-container
        [ngTemplateOutlet]="body"
        [ngTemplateOutletContext]="context(defaultBody)"
      />
    }
  `

@Directive()
export abstract class ChartTooltipBody<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> {
  readonly target =
    input.required<ChartTooltipBodyTarget<TDatum, TXValue, TYValue>>()
  readonly template = input<TemplateRef<
    ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>
  > | null>(null)

  protected isText(content: ChartTooltipContent | string): content is string {
    return typeof content === 'string'
  }

  protected context(
    defaultBody: TemplateRef<unknown>,
  ): ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue> {
    const { primaryPoint, points, content, pinned, dismiss } = this.target()
    const context = {
      primaryPoint,
      points,
      content,
      pinned,
      dismiss,
      defaultBody,
    }
    return { ...context, $implicit: context }
  }
}
