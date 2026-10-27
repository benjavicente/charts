import {
  Component,
  effect,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core'
import { NgTemplateOutlet } from '@angular/common'
import { TestBed } from '@angular/core/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineChart, lineY } from '@tanstack/charts'
import { tooltip } from '@tanstack/charts/tooltip'
import { portal } from '@tanstack/charts/tooltip/portal'
import { scaleLinear } from 'd3-scale'
import type {
  ChartInteractionController,
  ChartPoint,
  ChartRenderContext,
} from '@tanstack/charts'
import {
  ChartComponent,
  ChartTooltipBodyDirective,
} from '@tanstack/charts/angular'
import type { ChartComponentOptions } from '@tanstack/charts/angular'

const rows = [
  { id: 'a', x: 0, y: 2 },
  { id: 'b', x: 1, y: 4 },
]
type Datum = (typeof rows)[number]
const definition = defineChart({
  marks: [lineY(rows, { x: 'x', y: 'y', key: 'id' })],
  scales: {
    x: { scale: scaleLinear().domain([0, 1]) },
    y: { scale: scaleLinear().domain([0, 4]) },
  },
  tooltip: { use: tooltip, format: (point) => point.datum.id },
})
let childDestroys = 0

@Component({ selector: 'test-tooltip-child', standalone: true, template: '' })
class TooltipChild {
  ngOnDestroy() {
    childDestroys++
  }
}

@Component({
  standalone: true,
  imports: [ChartComponent, ChartTooltipBodyDirective, TooltipChild],
  template: `
    <div
      tanstack-chart
      id="consumer-chart"
      class="consumer-class"
      data-owner="consumer"
      aria-label="Layout wrapper"
      tabindex="-1"
      [style.width.px]="hostWidth()"
      [style.height.px]="hostHeight()"
      [options]="options()"
    >
      @if (body() === 'first') {
        <ng-template
          [tanstackChartTooltipBody]="options().definition"
          let-context
        >
          <span data-primary>{{ context.primaryPoint?.datum?.id }}</span>
          <span data-content>{{ context.content }}</span>
          <span data-pinned>{{ context.pinned }}</span>
          <test-tooltip-child />
          <button (click)="context.dismiss()">Dismiss</button>
        </ng-template>
      } @else if (body() === 'replacement') {
        <ng-template
          [tanstackChartTooltipBody]="options().definition"
          let-context
        >
          <strong data-primary>{{ context.primaryPoint?.datum?.id }}</strong>
          <test-tooltip-child />
        </ng-template>
      }
    </div>
  `,
})
class TooltipHost {
  readonly body = signal<'first' | 'replacement' | undefined>('first')
  readonly hostWidth = signal<number | undefined>(undefined)
  readonly hostHeight = signal<number | undefined>(undefined)
  readonly controller = signal<ChartInteractionController<
    Datum,
    number,
    number
  > | null>(null)
  readonly points = signal<readonly ChartPoint<Datum, number, number>[]>([])
  readonly locale = signal('en')
  readonly selected = signal<string | null>(null)
  focusEffectRuns = 0
  callbackLocales: string[] = []
  renderedHostWidths: string[] = []
  readonly options = signal<ChartComponentOptions<Datum, number, number>>({
    definition,
    width: 480,
    height: 260,
    ariaLabel: 'Signal revenue',
    onRender: ({ interaction, scene, container }) => {
      this.controller.set(interaction)
      this.points.set(scene.points)
      this.renderedHostWidths.push(container.parentElement?.style.width ?? '')
    },
    onFocusChange: () => this.callbackLocales.push(this.locale()),
  })

  constructor() {
    effect(() => {
      const controller = this.controller()
      const selected = this.selected()
      if (!controller || !selected) return
      const point = this.points().find(
        (candidate) => candidate.datum.id === selected,
      )
      if (!point) return
      this.focusEffectRuns++
      controller.setControlledFocus(point)
    })
  }

  focus(id: string, pinned = false) {
    const point = this.points().find((candidate) => candidate.datum.id === id)
    const controller = this.controller()
    if (!point || !controller) throw new Error('ChartComponent has not mounted')
    controller.setControlledFocus(point, { pinned })
  }
}

@Component({
  standalone: true,
  imports: [
    ChartComponent,
    ChartTooltipBodyDirective,
    NgTemplateOutlet,
    TooltipChild,
  ],
  template: `
    <div tanstack-chart [options]="options()">
      <ng-template
        [tanstackChartTooltipBody]="options().definition"
        let-context
      >
        <section data-rich-tooltip>
          <ng-container [ngTemplateOutlet]="context.defaultBody" />
          <div tanstack-chart [options]="nestedOptions()"></div>
          <test-tooltip-child />
          <button (click)="context.dismiss()">Dismiss</button>
        </section>
      </ng-template>
    </div>
  `,
})
class PortaledTooltipHost extends TooltipHost {
  nestedRenders = 0
  nestedController?: ChartInteractionController<Datum, number, number>
  readonly nestedOptions = signal<ChartComponentOptions<Datum, number, number>>(
    {
      definition: defineChart(definition, { tooltip: false }),
      width: 120,
      height: 80,
      ariaLabel: 'Tooltip trend',
      onRender: ({ interaction }) => {
        this.nestedController = interaction
        this.nestedRenders++
      },
    },
  )
}

@Component({
  standalone: true,
  imports: [ChartComponent],
  template: `
    <div
      tanstack-chart
      [options]="options()"
      (rendered)="renders.push($event)"
      (focusChange)="onFocusOutput($event)"
      (focusGroupChange)="groups.push($event)"
      (pointSelect)="selections.push($event)"
    ></div>
  `,
})
class OutputHost extends TooltipHost {
  readonly renders: ChartRenderContext<Datum, number, number>[] = []
  readonly focused: (ChartPoint<Datum, number, number> | null)[] = []
  readonly groups: (readonly ChartPoint<Datum, number, number>[])[] = []
  readonly selections: (ChartPoint<Datum, number, number> | null)[] = []
  readonly outputLocales: string[] = []
  readonly focusOrder: string[] = []

  onFocusOutput(point: ChartPoint<Datum, number, number> | null) {
    this.focusOrder.push('output')
    this.focused.push(point)
    this.outputLocales.push(this.locale())
  }
}

afterEach(() => TestBed.resetTestingModule())

async function mount() {
  TestBed.configureTestingModule({
    imports: [TooltipHost],
    providers: [provideZonelessChangeDetection()],
  })
  const fixture = TestBed.createComponent(TooltipHost)
  await fixture.whenStable()
  return fixture
}

describe('signal Angular adapter', () => {
  it('supports all four outputs alongside callbacks and without callbacks', async () => {
    TestBed.configureTestingModule({
      imports: [OutputHost],
      providers: [provideZonelessChangeDetection()],
    })
    const fixture = TestBed.createComponent(OutputHost)
    const host = fixture.componentInstance
    const rendered: ChartRenderContext<Datum, number, number>[] = []
    const focused: (ChartPoint<Datum, number, number> | null)[] = []
    const groups: (readonly ChartPoint<Datum, number, number>[])[] = []
    const selections: (ChartPoint<Datum, number, number> | null)[] = []
    const initial = host.options()
    host.options.set({
      ...initial,
      onRender: (context) => {
        initial.onRender?.(context)
        rendered.push(context)
      },
      onFocusChange: (point) => {
        host.focusOrder.push('callback')
        initial.onFocusChange?.(point)
        focused.push(point)
      },
      onFocusGroupChange: (points) => groups.push(points),
      onSelect: (point) => selections.push(point),
    })
    await fixture.whenStable()
    expect(rendered.length).toBeGreaterThan(0)
    expect(host.renders).toEqual(rendered)
    expect(host.renders[0]).toBe(rendered[0])

    host.selected.set('a')
    await fixture.whenStable()
    expect(focused.at(-1)?.datum.id).toBe('a')
    expect(host.focused).toEqual(focused)
    expect(host.groups).toEqual(groups)
    expect(host.groups.at(-1)).toBe(groups.at(-1))
    expect(host.focusOrder).toEqual(['callback', 'output'])
    const effectRuns = host.focusEffectRuns
    host.locale.set('fr')
    await fixture.whenStable()
    expect(host.focusEffectRuns).toBe(effectRuns)

    const svg: SVGSVGElement = fixture.nativeElement.querySelector('svg')
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 480, 260),
    )
    const point = host.points().find((point) => point.datum.id === 'b')!
    svg.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: point.x,
        clientY: point.y,
      }),
    )
    await fixture.whenStable()
    expect(selections.at(-1)?.datum.id).toBe('b')
    expect(host.selections).toEqual(selections)
    expect(host.selections.at(-1)).toBe(selections.at(-1))

    const callbackRenders = rendered.length
    host.options.update((options) => ({
      ...options,
      onRender: undefined,
      onFocusChange: undefined,
      onFocusGroupChange: undefined,
      onSelect: undefined,
      ariaLabel: 'Output-only chart',
    }))
    await fixture.whenStable()
    expect(rendered).toHaveLength(callbackRenders)
    expect(host.renders.length).toBeGreaterThan(callbackRenders)
    const callbackFocus = focused.length
    const callbackGroups = groups.length
    const callbackSelections = selections.length
    host.controller()!.setControlledFocus(null)
    host.focus('a')
    svg.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        clientX: point.x,
        clientY: point.y,
      }),
    )
    await fixture.whenStable()
    expect(focused).toHaveLength(callbackFocus)
    expect(groups).toHaveLength(callbackGroups)
    expect(selections).toHaveLength(callbackSelections)
    expect(host.focused.length).toBeGreaterThan(callbackFocus)
    expect(host.groups.length).toBeGreaterThan(callbackGroups)
    expect(host.selections.length).toBeGreaterThan(callbackSelections)
  })

  it('updates structured default content and owns a nested chart in a portaled tooltip', async () => {
    childDestroys = 0
    TestBed.configureTestingModule({
      imports: [PortaledTooltipHost],
      providers: [provideZonelessChangeDetection()],
    })
    const fixture = TestBed.createComponent(PortaledTooltipHost)
    const host = fixture.componentInstance
    host.options.update((options) => ({
      ...options,
      definition: defineChart(definition, {
        tooltip: {
          use: tooltip,
          portal,
          content: (points) => ({
            title: 'Point ' + points[0]?.datum.id,
            color: '#2563eb',
            rows: points.map((point) => ({
              label: 'Value',
              value: String(point.datum.y),
              color: '#2563eb',
              active: true,
            })),
          }),
        },
      }),
    }))
    await fixture.whenStable()
    const svg: SVGSVGElement = fixture.nativeElement.querySelector('svg')
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 480, 260),
    )
    host.focus('a', true)
    await fixture.whenStable()

    const tooltipElement = document.querySelector<HTMLElement>(
      '[data-ts-chart-tooltip-portal]',
    )!
    const body = tooltipElement.querySelector('[data-rich-tooltip]')!
    const title = body.querySelector('.ts-chart-tooltip__title')!
    const row = body.querySelector('.ts-chart-tooltip__row')!
    const nestedSvg = body.querySelector<SVGSVGElement>('svg')!
    const nestedController = host.nestedController!
    expect(tooltipElement.parentElement).toBe(document.body)
    expect(
      fixture.nativeElement.querySelector('[data-rich-tooltip]'),
    ).toBeNull()
    expect(tooltipElement.hidden).toBe(false)
    expect(tooltipElement.getAttribute('role')).toBe('dialog')
    expect(title.textContent?.trim()).toBe('Point a')
    expect(row.textContent?.replaceAll(/\s/g, '')).toBe('Value2')
    expect(row.getAttribute('data-active')).toBe('true')
    expect(
      row.querySelector<HTMLElement>('.ts-chart-tooltip__swatch')?.style
        .background,
    ).toBe('rgb(37, 99, 235)')
    expect(nestedSvg.getAttribute('aria-label')).toBe('Tooltip trend')
    vi.spyOn(nestedSvg, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 120, 80),
    )
    expect(nestedController.clientToScene(60, 40)).toEqual({ x: 60, y: 40 })

    host.focus('b', true)
    await fixture.whenStable()
    expect(tooltipElement.querySelector('[data-rich-tooltip]')).toBe(body)
    expect(body.querySelector('.ts-chart-tooltip__title')).toBe(title)
    expect(title.textContent?.trim()).toBe('Point b')
    expect(row.textContent?.replaceAll(/\s/g, '')).toBe('Value4')
    expect(body.querySelector('svg')).toBe(nestedSvg)
    expect(host.nestedController).toBe(nestedController)

    host.nestedOptions.update((options) => ({
      ...options,
      ariaLabel: 'Updated tooltip trend',
    }))
    await fixture.whenStable()
    expect(body.querySelector('svg')).toBe(nestedSvg)
    expect(nestedSvg.getAttribute('aria-label')).toBe('Updated tooltip trend')

    body.querySelector<HTMLButtonElement>('button')!.click()
    await fixture.whenStable()
    expect(tooltipElement.hidden).toBe(true)
    expect(tooltipElement.querySelector('[data-rich-tooltip]')).toBeNull()
    expect(nestedSvg.isConnected).toBe(false)
    expect(nestedController.clientToScene(60, 40)).toBeNull()
    expect(childDestroys).toBe(1)
    const renders = host.nestedRenders
    host.nestedOptions.update((options) => ({ ...options, width: 140 }))
    await fixture.whenStable()
    expect(host.nestedRenders).toBe(renders)

    host.focus('a', true)
    await fixture.whenStable()
    const reopenedSvg = tooltipElement.querySelector('svg')!
    const reopenedController = host.nestedController!
    expect(reopenedSvg).not.toBe(nestedSvg)
    expect(reopenedSvg.getAttribute('aria-label')).toBe('Updated tooltip trend')
    fixture.destroy()
    expect(tooltipElement.isConnected).toBe(false)
    expect(reopenedSvg.isConnected).toBe(false)
    expect(reopenedController.clientToScene(60, 40)).toBeNull()
    expect(childDestroys).toBe(2)
  })

  it('updates an active tooltip view and releases it on hide, reopen and dismiss', async () => {
    childDestroys = 0
    const fixture = await mount()
    const host = fixture.componentInstance
    host.focus('a')
    await fixture.whenStable()
    const first = fixture.nativeElement.querySelector('[data-primary]')
    expect(first?.textContent).toBe('a')
    host.focus('b')
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('[data-primary]')).toBe(first)
    expect(first?.textContent).toBe('b')
    expect(
      fixture.nativeElement.querySelector('[data-content]')?.textContent,
    ).toBe('b')
    host.controller()?.setControlledFocus(null)
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('[data-primary]')).toBeNull()
    expect(childDestroys).toBe(1)
    host.focus('a', true)
    await fixture.whenStable()
    const reopened = fixture.nativeElement.querySelector('[data-primary]')
    expect(reopened).not.toBe(first)
    expect(reopened?.textContent).toBe('a')
    expect(
      fixture.nativeElement.querySelector('[data-pinned]')?.textContent,
    ).toBe('true')
    expect(childDestroys).toBe(1)
    fixture.nativeElement.querySelector('button')?.click()
    await fixture.whenStable()
    expect(
      fixture.nativeElement.querySelector('.ts-chart-tooltip')?.hidden,
    ).toBe(true)
    expect(childDestroys).toBe(2)
    expect(fixture.nativeElement.querySelector('[data-primary]')).toBeNull()
    fixture.destroy()
    expect(childDestroys).toBe(2)
  })

  it('does not track callback signal reads in the consumer focus effect', async () => {
    const fixture = await mount()
    const host = fixture.componentInstance
    host.selected.set('a')
    await fixture.whenStable()
    expect(host.callbackLocales).toContain('en')
    const runs = host.focusEffectRuns
    expect(runs).toBeGreaterThan(0)
    host.locale.set('fr')
    await fixture.whenStable()
    expect(host.focusEffectRuns).toBe(runs)
    host.selected.set('b')
    await fixture.whenStable()
    expect(host.focusEffectRuns).toBe(runs + 1)
    expect(host.callbackLocales.at(-1)).toBe('fr')
  })

  it('keeps the controller and SVG stable and updates after native host bindings', async () => {
    const fixture = await mount()
    const host = fixture.componentInstance
    const element: HTMLElement =
      fixture.nativeElement.querySelector('[tanstack-chart]')
    expect(element.style.position).toBe('relative')
    expect(element.style.width).toBe('480px')
    expect(element.style.height).toBe('260px')
    const svg = element.querySelector('svg')
    const controller = host.controller()
    expect(element.tagName).toBe('DIV')
    expect(element.classList.contains('ts-chart-host')).toBe(true)
    expect(element.classList.contains('consumer-class')).toBe(true)
    expect(element.dataset['owner']).toBe('consumer')
    expect(element.getAttribute('aria-label')).toBe('Layout wrapper')
    expect(element.getAttribute('tabindex')).toBe('-1')
    expect(svg?.getAttribute('aria-label')).toBe('Signal revenue')
    expect(svg?.getAttribute('tabindex')).toBe('0')
    expect(element.querySelector('.ts-chart-host')).toBeNull()
    host.hostWidth.set(600)
    host.options.update((options) => ({
      ...options,
      width: 600,
      ariaLabel: 'Updated signal revenue',
    }))
    await fixture.whenStable()
    expect(host.renderedHostWidths.at(-1)).toBe('600px')
    expect(element.querySelector('svg')).toBe(svg)
    expect(svg?.getAttribute('aria-label')).toBe('Updated signal revenue')
    expect(host.controller()).toBe(controller)
  })

  it('keeps native host styling separate from SVG classes and restores sizing defaults', async () => {
    const fixture = await mount()
    const host = fixture.componentInstance
    const element: HTMLElement =
      fixture.nativeElement.querySelector('[tanstack-chart]')
    host.options.update((options) => ({ ...options, svgClass: 'series-chart' }))
    await fixture.whenStable()
    const svg = element.querySelector('svg')
    expect(svg?.classList.contains('series-chart')).toBe(true)
    expect(element.classList.contains('series-chart')).toBe(false)
    expect(element.classList.contains('consumer-class')).toBe(true)
    host.hostHeight.set(220)
    await fixture.whenStable()
    expect(element.style.height).toBe('220px')
    host.options.update((options) => ({ ...options, svgClass: undefined }))
    await fixture.whenStable()
    expect(svg?.classList.contains('series-chart')).toBe(false)
    expect(element.style.height).toBe('220px')
    host.hostHeight.set(undefined)
    host.options.update((options) => ({
      ...options,
      height: undefined,
      aspectRatio: 2,
    }))
    await fixture.whenStable()
    expect(element.style.height).toBe('')
    expect(element.style.aspectRatio).toBe('2 / 1')
    host.options.update((options) => ({
      ...options,
      aspectRatio: undefined,
      width: undefined,
    }))
    host.hostWidth.set(undefined)
    await fixture.whenStable()
    expect(element.style.height).toBe('320px')
    expect(element.style.width).toBe('100%')
    expect(element.style.aspectRatio).toBe('')
  })

  it('cleans up a replaced template and supports removing and restoring projection', async () => {
    childDestroys = 0
    const fixture = await mount()
    const host = fixture.componentInstance
    host.focus('a')
    await fixture.whenStable()
    host.body.set('replacement')
    await fixture.whenStable()
    expect(
      fixture.nativeElement.querySelector('strong[data-primary]')?.textContent,
    ).toBe('a')
    expect(childDestroys).toBe(1)
    host.body.set(undefined)
    await fixture.whenStable()
    expect(fixture.nativeElement.querySelector('[data-primary]')).toBeNull()
    expect(childDestroys).toBe(2)
    host.body.set('first')
    await fixture.whenStable()
    host.focus('b')
    await fixture.whenStable()
    expect(
      fixture.nativeElement.querySelector('[data-primary]')?.textContent,
    ).toBe('b')
    fixture.destroy()
    expect(childDestroys).toBe(3)
  })

  it('can be destroyed before inputs, queries or the ownership effect run', () => {
    TestBed.configureTestingModule({ imports: [ChartComponent] })
    const fixture = TestBed.createComponent(ChartComponent)
    expect(() => fixture.destroy()).not.toThrow()
  })
})
