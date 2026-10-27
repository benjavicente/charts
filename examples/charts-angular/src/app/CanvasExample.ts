import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  signal,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import {
  Chart as CanvasChart,
  ChartTooltipBodyDirective,
} from '@tanstack/charts/angular/canvas'
import type { ChartOptions } from '@tanstack/charts/angular/canvas'
import { defineChart } from '@tanstack/charts'
import { tooltip } from '@tanstack/charts/tooltip'
import { portal } from '@tanstack/charts/tooltip/portal'
import type { ChartPoint, ChartRendererRenderContext } from '@tanstack/charts'
import { createRevenueChart, revenueData } from './comparison-charts'
import type { RevenueDatum } from './comparison-charts'

type RenderContext = ChartRendererRenderContext<RevenueDatum, number, number>
type Point = ChartPoint<RevenueDatum, number, number>

@Component({
  selector: 'canvas-example',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CanvasChart, ChartTooltipBodyDirective, NgTemplateOutlet],
  template: `
    <section class="comparison-row" data-canvas-demo>
      <header class="comparison-row__header">
        <h2>05 · A Canvas default with the same Angular lifecycle</h2>
        <p>
          Marks and guides use Canvas. The projected tooltip remains an Angular
          view.
        </p>
        <div class="chart-controls">
          <button class="chart-control" (click)="focusFebruary()">
            Focus Canvas February
          </button>
          <button class="chart-control" (click)="locale.update(toggleLocale)">
            Change Canvas log format
          </button>
          <button class="chart-control" (click)="updated.update(toggle)">
            Update Canvas data
          </button>
          <button class="chart-control" (click)="showBody.update(toggle)">
            Toggle Canvas template
          </button>
          <button class="chart-control" (click)="visible.update(toggle)">
            {{ visible() ? 'Unmount Canvas' : 'Remount Canvas' }}
          </button>
        </div>
      </header>
      <article class="chart-card">
        @if (visible()) {
          <div
            tanstack-canvas-chart
            id="canvas-revenue"
            class="canvas-host"
            [style.height.px]="240"
            [options]="options()"
            (rendered)="onRendered($event)"
            (focusChange)="onFocus($event)"
            (focusGroupChange)="onGroup($event)"
            (pointSelect)="onSelect($event)"
          >
            @if (showBody()) {
              <ng-template
                [tanstackChartTooltipBody]="options().definition"
                let-body
              >
                <div data-canvas-tooltip>
                  <strong data-canvas-primary>{{
                    body.primaryPoint?.datum?.month
                  }}</strong>
                  <ng-container [ngTemplateOutlet]="body.defaultBody" />
                  <button (click)="body.dismiss()">
                    Dismiss Canvas tooltip
                  </button>
                </div>
              </ng-template>
            }
          </div>
        }
        <dl class="case-metrics">
          <div>
            <dt>Focus effect runs</dt>
            <dd data-canvas-effect>{{ focusRuns() }}</dd>
          </div>
          <div>
            <dt>Callback and output payloads match</dt>
            <dd data-canvas-events>{{ eventsMatch() }}</dd>
          </div>
          <div>
            <dt>Last focus</dt>
            <dd>{{ lastLog() }}</dd>
          </div>
        </dl>
        <span
          hidden
          data-canvas-point
          [attr.data-selected]="lastSelected()"
          [attr.data-group]="groupSize()"
          [attr.data-x]="selectedPoint()?.x"
          [attr.data-y]="selectedPoint()?.y"
        ></span>
      </article>
    </section>
  `,
})
export class CanvasExample {
  readonly selected = signal<string | null>(null)
  readonly updated = signal(false)
  readonly showBody = signal(true)
  readonly visible = signal(true)
  readonly locale = signal(false)
  readonly focusRuns = signal(0)
  readonly lastLog = signal('No focus yet')
  readonly eventsMatch = signal(true)
  readonly lastSelected = signal<string | null>(null)
  readonly groupSize = signal(0)
  readonly context = signal<RenderContext | null>(null)
  readonly selectedPoint = computed(() =>
    this.context()?.scene.points.find((point) => point.datum.id === 'b'),
  )
  readonly definition = computed(() =>
    defineChart(
      createRevenueChart(
        this.updated()
          ? revenueData.map((row) => ({ ...row, revenue: row.revenue + 8 }))
          : revenueData,
      ),
      {
        tooltip: { use: tooltip, portal, format: (point) => point.datum.month },
      },
    ),
  )
  #rendered?: RenderContext
  #focused?: Point | null
  #group?: readonly Point[]
  #selected?: Point | null
  readonly options = computed<ChartOptions<RevenueDatum, number, number>>(
    () => ({
      definition: this.definition(),
      ariaLabel: this.updated() ? 'Updated Canvas revenue' : 'Canvas revenue',
      className: 'canvas-surface',
      onRender: (context) => {
        this.#rendered = context
        this.context.set(context)
      },
      onFocusChange: (point) => {
        this.#focused = point
        this.lastLog.set(
          (this.locale() ? 'Month: ' : '') + (point?.datum.month ?? 'None'),
        )
      },
      onFocusGroupChange: (points) => {
        this.#group = points
      },
      onSelect: (point) => {
        this.#selected = point
      },
    }),
  )
  readonly toggle = (value: boolean) => !value
  readonly toggleLocale = this.toggle

  constructor() {
    effect(() => {
      const context = this.context()
      const selected = this.selected()
      const point = context?.scene.points.find(
        (point) => point.datum.id === selected,
      )
      if (!point || !context) return
      this.focusRuns.update((count) => count + 1)
      context.interaction.setControlledFocus(point, { pinned: true })
    })
    effect(() => {
      if (this.visible()) return
      this.context.set(null)
    })
  }
  focusFebruary() {
    if (this.selected() !== 'b') {
      this.selected.set('b')
      return
    }
    const context = this.context()
    const point = context?.scene.points.find((point) => point.datum.id === 'b')
    if (context && point)
      context.interaction.setControlledFocus(point, { pinned: true })
  }
  onRendered(context: RenderContext) {
    this.eventsMatch.update((matches) => matches && context === this.#rendered)
  }
  onFocus(point: Point | null) {
    this.eventsMatch.update((matches) => matches && point === this.#focused)
  }
  onGroup(points: readonly Point[]) {
    this.groupSize.set(points.length)
    this.eventsMatch.update((matches) => matches && points === this.#group)
  }
  onSelect(point: Point | null) {
    this.lastSelected.set(point?.datum.id ?? null)
    this.eventsMatch.update((matches) => matches && point === this.#selected)
  }
}
