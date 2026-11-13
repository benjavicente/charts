import {
  Component,
  NgZone,
  effect,
  provideZonelessChangeDetection,
  signal,
  ɵNoopNgZone as NoopNgZone,
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
import { Chart, ChartTooltipBodyDirective } from '@tanstack/charts/angular'
import { Chart as CanvasChart } from '@tanstack/charts/angular/canvas'
import type { ChartOptions } from '@tanstack/charts/angular'
import type { ChartOptions as CanvasChartOptions } from '@tanstack/charts/angular/canvas'

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

@Component({ selector: 'test-tooltip-child', template: '' })
class TooltipChild {
  ngOnDestroy() {
    childDestroys++
  }
}

@Component({
  imports: [Chart, ChartTooltipBodyDirective, TooltipChild],
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
  readonly options = signal<ChartOptions<Datum, number, number>>({
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
    if (!point || !controller) throw new Error('Chart has not mounted')
    controller.setControlledFocus(point, { pinned })
  }
}

@Component({
  imports: [Chart, ChartTooltipBodyDirective, NgTemplateOutlet, TooltipChild],
  template: `
    <div tanstack-chart [options]="options()">
      @if (body()) {
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
      }
    </div>
  `,
})
class PortaledTooltipHost extends TooltipHost {
  nestedRenders = 0
  nestedController?: ChartInteractionController<Datum, number, number>
  readonly nestedOptions = signal<ChartOptions<Datum, number, number>>({
    definition: defineChart(definition, { tooltip: false }),
    width: 120,
    height: 80,
    ariaLabel: 'Tooltip trend',
    onRender: ({ interaction }) => {
      this.nestedController = interaction
      this.nestedRenders++
    },
  })
}

@Component({
  imports: [Chart],
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

@Component({
  imports: [CanvasChart, ChartTooltipBodyDirective],
  template: `
    <div tanstack-canvas-chart [options]="options()">
      <ng-template
        [tanstackChartTooltipBody]="options().definition"
        let-context
      >
        <span data-primary>{{ context.primaryPoint?.datum?.id }}</span>
      </ng-template>
    </div>
  `,
})
class CanvasTooltipHost {
  controller?: ChartInteractionController<Datum, number, number>
  points: readonly ChartPoint<Datum, number, number>[] = []
  readonly options = signal<CanvasChartOptions<Datum, number, number>>({
    definition,
    width: 480,
    height: 260,
    ariaLabel: 'Canvas revenue',
    onRender: ({ interaction, scene }) => {
      this.controller = interaction
      this.points = scene.points
    },
  })

  focus(id: string, pinned = false) {
    const point = this.points.find((candidate) => candidate.datum.id === id)
    if (!point || !this.controller) throw new Error('Chart has not mounted')
    this.controller.setControlledFocus(point, { pinned })
  }
}

/** Records the zone boundary without requiring zone.js. */
class RecordingZone extends NoopNgZone {
  outsideDepth = 0
  insideDepth = 0

  override run<T>(
    fn: (...args: any[]) => T,
    applyThis?: any,
    applyArgs?: any,
  ): T {
    this.insideDepth++
    try {
      return super.run(fn, applyThis, applyArgs)
    } finally {
      this.insideDepth--
    }
  }

  override runOutsideAngular<T>(fn: (...args: any[]) => T): T {
    this.outsideDepth++
    try {
      return super.runOutsideAngular(fn)
    } finally {
      this.outsideDepth--
    }
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

    const structuredDefinition = host.options().definition
    host.options.update((options) => ({
      ...options,
      definition: defineChart(definition, {
        tooltip: { use: tooltip, portal, formatGroup: () => 'Plain revenue' },
      }),
    }))
    await fixture.whenStable()
    expect(body.textContent).toContain('Plain revenue')
    expect(body.querySelector('.ts-chart-tooltip__title')).toBeNull()
    expect(body.querySelector('.ts-chart-tooltip__row')).toBeNull()
    expect(body.querySelector('svg')).toBe(nestedSvg)
    host.options.update((options) => ({
      ...options,
      definition: structuredDefinition,
    }))
    await fixture.whenStable()
    expect(
      body.querySelector('.ts-chart-tooltip__title')?.textContent,
    ).toContain('Point b')
    expect(body.textContent).not.toContain('Plain revenue')
    expect(body.querySelector('svg')).toBe(nestedSvg)

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

  it('destroys a directive-owned portaled body and restores it without changing focus', async () => {
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
        tooltip: { use: tooltip, portal, format: (point) => point.datum.id },
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
    const originalBody = tooltipElement.querySelector('[data-rich-tooltip]')!
    const nestedSvg = originalBody.querySelector('svg')!
    expect(originalBody.textContent).toContain('a')
    host.body.set(undefined)
    await fixture.whenStable()
    expect(originalBody.isConnected).toBe(false)
    expect(nestedSvg.isConnected).toBe(false)
    expect(tooltipElement.querySelector('[data-rich-tooltip]')).toBeNull()
    expect(tooltipElement.hidden).toBe(false)
    expect(tooltipElement.textContent).toBe('a')
    expect(childDestroys).toBe(1)
    host.body.set('first')
    await fixture.whenStable()
    const restored = tooltipElement.querySelector('[data-rich-tooltip]')!
    expect(restored).not.toBe(originalBody)
    expect(restored.textContent).toContain('a')
    expect(restored.querySelector('svg')).not.toBe(nestedSvg)
    fixture.destroy()
    expect(restored.isConnected).toBe(false)
    expect(tooltipElement.isConnected).toBe(false)
    expect(childDestroys).toBe(2)
  })

  it('renders the body before the core measures and positions the tooltip', async () => {
    const primary = (root: ParentNode) =>
      root.querySelector('[data-primary]')?.textContent
    const expectSynchronous = async (
      fixture: { whenStable(): Promise<unknown> },
      focus: (id: string) => void,
      root: () => ParentNode,
    ) => {
      // The core positions the tooltip inside the focus call, so the body must
      // already reflect the new point when that call returns.
      focus('a')
      expect(primary(root())).toBe('a')
      await fixture.whenStable()
      focus('b')
      expect(primary(root())).toBe('b')
      await fixture.whenStable()
      expect(primary(root())).toBe('b')
    }

    const svgFixture = await mount()
    await expectSynchronous(
      svgFixture,
      (id) => svgFixture.componentInstance.focus(id),
      () => svgFixture.nativeElement,
    )
    TestBed.resetTestingModule()

    TestBed.configureTestingModule({
      imports: [PortaledTooltipHost],
      providers: [provideZonelessChangeDetection()],
    })
    const portaled = TestBed.createComponent(PortaledTooltipHost)
    portaled.componentInstance.options.update((options) => ({
      ...options,
      definition: defineChart(definition, {
        tooltip: { use: tooltip, portal, format: (point) => point.datum.id },
      }),
    }))
    await portaled.whenStable()
    const svg: SVGSVGElement = portaled.nativeElement.querySelector('svg')
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 480, 260),
    )
    const portalBody = () =>
      document.querySelector<HTMLElement>('[data-ts-chart-tooltip-portal]')!
    portaled.componentInstance.focus('a', true)
    expect(
      portalBody().querySelector('[data-rich-tooltip]')?.textContent,
    ).toContain('a')
    await portaled.whenStable()
    portaled.componentInstance.focus('b', true)
    expect(
      portalBody().querySelector('[data-rich-tooltip]')?.textContent,
    ).toContain('b')
    portaled.destroy()
    TestBed.resetTestingModule()

    TestBed.configureTestingModule({
      imports: [CanvasTooltipHost],
      providers: [provideZonelessChangeDetection()],
    })
    // jsdom has no Canvas 2D context; every drawing call is a no-op.
    const noop = () => ({ addColorStop() {}, width: 0 })
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(
        () =>
          new Proxy({} as CanvasRenderingContext2D, {
            get: (target, key) =>
              key in target ? Reflect.get(target, key) : noop,
          }),
      )
    const canvas = TestBed.createComponent(CanvasTooltipHost)
    await canvas.whenStable()
    await expectSynchronous(
      canvas,
      (id) => canvas.componentInstance.focus(id),
      () => canvas.nativeElement,
    )
    canvas.destroy()
    getContext.mockRestore()
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

  it('keeps native host styling separate from surface classes and restores sizing defaults', async () => {
    const fixture = await mount()
    const host = fixture.componentInstance
    const element: HTMLElement =
      fixture.nativeElement.querySelector('[tanstack-chart]')
    host.options.update((options) => ({
      ...options,
      className: 'series-chart',
    }))
    await fixture.whenStable()
    const svg = element.querySelector('svg')
    expect(svg?.classList.contains('series-chart')).toBe(true)
    expect(element.classList.contains('series-chart')).toBe(false)
    expect(element.classList.contains('consumer-class')).toBe(true)
    host.hostHeight.set(220)
    await fixture.whenStable()
    expect(element.style.height).toBe('220px')
    host.options.update((options) => ({ ...options, className: undefined }))
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
    // Restore while the existing point remains focused, without a new focus event.
    host.body.set('first')
    await fixture.whenStable()
    expect(
      fixture.nativeElement.querySelector('[data-primary]')?.textContent,
    ).toBe('a')
    host.focus('b')
    await fixture.whenStable()
    expect(
      fixture.nativeElement.querySelector('[data-primary]')?.textContent,
    ).toBe('b')
    fixture.destroy()
    expect(childDestroys).toBe(3)
  })

  it('runs the core outside the zone and notifications inside it', async () => {
    TestBed.configureTestingModule({
      imports: [OutputHost],
      providers: [
        provideZonelessChangeDetection(),
        { provide: NgZone, useClass: RecordingZone },
      ],
    })
    const zone = TestBed.inject(NgZone) as RecordingZone
    const listeners: number[] = []
    const addEventListener = HTMLElement.prototype.addEventListener
    const added = vi
      .spyOn(HTMLElement.prototype, 'addEventListener')
      .mockImplementation(function (
        this: HTMLElement,
        ...args: Parameters<typeof addEventListener>
      ) {
        if (this.classList.contains('ts-chart-surface'))
          listeners.push(zone.outsideDepth)
        return addEventListener.apply(this, args)
      })
    const fixture = TestBed.createComponent(OutputHost)
    const host = fixture.componentInstance
    const select = { inside: 0 }
    const focus = { inside: 0, outside: 0 }
    host.options.update((options) => ({
      ...options,
      onFocusChange: () => {
        focus.inside = zone.insideDepth
        focus.outside = zone.outsideDepth
      },
      onSelect: () => (select.inside = zone.insideDepth),
    }))
    await fixture.whenStable()
    added.mockRestore()
    // Angular runs render hooks, and so the core's mount, outside the zone.
    expect(listeners.length).toBeGreaterThan(0)
    expect(listeners.every((depth) => depth > 0)).toBe(true)

    // A notification from a core listener re-enters the zone.
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
    expect(select.inside).toBe(1)
    expect(host.selections.at(-1)?.datum.id).toBe('b')

    // A consumer operation moves the core out; its notification comes back in.
    host.focus('a')
    expect(focus).toEqual({ inside: 1, outside: 1 })
  })

  it('can be destroyed before inputs, queries or the ownership effect run', () => {
    TestBed.configureTestingModule({ imports: [Chart] })
    const fixture = TestBed.createComponent(Chart)
    expect(() => fixture.destroy()).not.toThrow()
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({ imports: [CanvasChart] })
    const canvas = TestBed.createComponent(CanvasChart)
    expect(() => canvas.destroy()).not.toThrow()
  })
})
