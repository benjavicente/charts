import { Component } from '@angular/core'
import type { ChartOptions } from './types'
import { Chart } from './Chart'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import type { ChartDefinition } from '@tanstack/charts'

interface Datum {
  id: string
  x: number
  y: number
}

@Component({
  imports: [Chart, ChartTooltipBodyDirective],
  template: `
    <div tanstack-chart [options]="options">
      <ng-template [tanstackChartTooltipBody]="options.definition" let-tooltip>
        @for (point of tooltip.points; track $index) {
          {{ point.datum.id }}
        }
        <button
          type="button"
          [disabled]="!tooltip.pinned"
          (click)="tooltip.dismiss()"
        >
          Close
        </button>
      </ng-template>
    </div>
  `,
})
class ChartTooltipBodyTypeTest {
  protected options!: ChartOptions<Datum, number, number>
}

void ChartTooltipBodyTypeTest

function checkDirective(
  directive: ChartTooltipBodyDirective<Datum, number, number>,
  context: unknown,
) {
  const definition: ChartDefinition<Datum, number, number> =
    directive.definition()
  // @ts-expect-error Definition is a read-only input signal, not a value property.
  directive.definition = definition

  if (ChartTooltipBodyDirective.ngTemplateContextGuard(directive, context)) {
    const datum: Datum | undefined = context.primaryPoint?.datum
    const coordinate: number | undefined = context.primaryPoint?.xValue
    // @ts-expect-error The context preserves the datum type.
    context.primaryPoint?.datum.missing
    // @ts-expect-error The x coordinate is numeric, not a Date.
    context.primaryPoint?.xValue.getTime()
    void [datum, coordinate]
  }
}
void checkDirective
