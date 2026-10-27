import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { Chart, ChartTooltipBodyDirective } from '@tanstack/charts/angular'
import { injectComparisonState } from './inject-comparison-state'
import type { ComparisonCase, ComparisonOptions } from './comparison-charts'

@Component({
  selector: 'original-example',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart, ChartTooltipBodyDirective, NgTemplateOutlet],
  template: `
    <article class="chart-card" data-adapter="original">
      <header class="chart-card__header">
        <h3>Original adapter</h3>
        <span class="chart-card__badge">Deprecated Chart</span>
      </header>
      <div
        class="chart-stage"
        [class.chart-stage--host]="scenario().kind === 'host'"
      >
        @if (visible()) {
          <tanstack-chart
            [options]="state.options()"
            [id]="state.hostId()"
            [class]="state.hostClass()"
            [attr.data-owner]="hostIdentity()"
            [style.height]="state.nativeHeight()"
          >
            @if (scenario().kind === 'tooltip') {
              <ng-template
                [tanstackChartTooltipBody]="state.options().definition"
                let-tooltip
              >
                <div class="comparison-tooltip" data-tooltip-adapter="original">
                  <span>Primary point</span>
                  <strong data-testid="tooltip-primary">{{
                    tooltip.primaryPoint?.datum?.month
                  }}</strong>
                  <span
                    >Current content: {{ tooltip.points[0]?.datum.month }}</span
                  >
                  <ng-container [ngTemplateOutlet]="tooltip.defaultBody" />
                </div>
              </ng-template>
            }
          </tanstack-chart>
        } @else {
          <div class="chart-placeholder">
            Chart unmounted. Its resources have been released.
          </div>
        }
      </div>
      @switch (scenario().kind) {
        @case ('tooltip') {
          <p class="case-note">
            The reused tooltip context keeps its first primary point.
          </p>
        }
        @case ('effect') {
          <dl class="case-metrics">
            <div>
              <dt>Focus effect runs</dt>
              <dd data-testid="effect-runs">{{ state.effectRuns() }}</dd>
            </div>
            <div>
              <dt>Last callback log</dt>
              <dd data-testid="last-log">{{ state.lastLog() }}</dd>
            </div>
          </dl>
        }
        @case ('host') {
          <dl class="case-metrics">
            <div>
              <dt>Identity</dt>
              <dd>
                <code>{{ state.hostId() }}</code>
              </dd>
            </div>
            <div>
              <dt>Rendered scene height</dt>
              <dd data-testid="scene-height">{{ state.sceneHeight() }}px</dd>
            </div>
          </dl>
          <p class="case-note">
            The ID and class belong to the outer element. Its inner
            .ts-chart-host has neither, so the combined CSS selector misses the
            layout owner.
          </p>
          <details>
            <summary>Host markup</summary>
            <pre>
&lt;tanstack-chart
  [id]=&quot;id&quot; [class]=&quot;'chart-' + id&quot;
  [attr.data-owner]=&quot;owner&quot;
  [style.height.px]=&quot;height&quot; /&gt;</pre>
          </details>
        }
        @case ('lifetime') {
          <dl class="case-metrics">
            <div>
              <dt>Render callbacks</dt>
              <dd data-testid="render-count">{{ state.renderCount() }}</dd>
            </div>
            <div>
              <dt>Scene height</dt>
              <dd data-testid="scene-height">{{ state.sceneHeight() }}px</dd>
            </div>
          </dl>
        }
      }
    </article>
  `,
})
export class OriginalExample {
  readonly scenario = input.required<ComparisonCase>()
  readonly options = input.required<ComparisonOptions>()
  readonly requestedPoint = input<string | null>(null)
  readonly logFormat = input<'short' | 'long'>('short')
  readonly hostIdentity = input<'revenue' | 'forecast'>('revenue')
  readonly nativeHeight = input<number | undefined>(undefined)
  readonly visible = input(true)
  protected readonly state = injectComparisonState(
    {
      scenario: this.scenario,
      options: this.options,
      requestedPoint: this.requestedPoint,
      logFormat: this.logFormat,
      hostIdentity: this.hostIdentity,
      nativeHeight: this.nativeHeight,
      visible: this.visible,
    },
    'original',
  )
}
