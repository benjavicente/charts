import {
  APP_ID,
  Injectable,
  NgZone,
  PLATFORM_ID,
  Renderer2,
  afterRenderEffect,
  computed,
  inject,
  untracked,
} from '@angular/core'
import type { ElementRef, OutputEmitterRef } from '@angular/core'
import { resolveChartAdapterLayout } from '@tanstack/charts/adapter'
import type {
  ChartInteractionController,
  ChartPoint,
  ChartRenderer,
  ChartRendererHostOptions,
  ChartRendererRenderContext,
  ChartTooltipBodyTarget,
  ChartValue,
} from '@tanstack/charts'
import type { ChartTooltipBodyRenderer } from '../tooltip/chart-tooltip-body-token'
import { injectChartRendererAdapter } from './inject-chart-renderer-adapter'
import { CHART_SERVER_RENDER } from '../server/chart-server-render'

@Injectable({ providedIn: 'root' })
class ChartIdGenerator {
  readonly #appId = inject(APP_ID)
  #nextId = 0

  next(namespace: string) {
    return `ts-chart-${namespace}-${this.#appId}-${++this.#nextId}`.replaceAll(
      /[^a-zA-Z0-9_-]/g,
      '',
    )
  }
}

/** Component options before the renderer entry supplies its renderer. */
export type ChartHostInputOptions<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
  TRendered,
> = Omit<
  ChartRendererHostOptions<TDatum, TXValue, TYValue>,
  'renderer' | 'onRender' | 'onTooltipBodyChange'
> & { onRender?: (context: TRendered) => void }

/** The public declarations a chart component exposes. */
export interface ChartHostDeclarations<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
  TOptions,
  TRendered,
> {
  readonly options: () => TOptions
  readonly rendered: OutputEmitterRef<TRendered>
  readonly focusChange: OutputEmitterRef<ChartPoint<
    TDatum,
    TXValue,
    TYValue
  > | null>
  readonly focusGroupChange: OutputEmitterRef<
    readonly ChartPoint<TDatum, TXValue, TYValue>[]
  >
  readonly pointSelect: OutputEmitterRef<ChartPoint<
    TDatum,
    TXValue,
    TYValue
  > | null>
}

/** What differs between renderer entries, plus the chart's own queries. */
export interface ChartHostRendererConfig<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
  TRendered,
> {
  readonly id: string
  readonly surface: () => ElementRef<HTMLElement> | undefined
  readonly tooltipBody: () =>
    ChartTooltipBodyRenderer<TDatum, TXValue, TYValue> | undefined
  /** Read reactively; a new renderer identity remounts the chart surface. */
  readonly renderer: () => ChartRenderer<TDatum, TXValue, TYValue>
  /** Shapes core's neutral render context into this entry's public context. */
  toRenderContext(
    context: ChartRendererRenderContext<TDatum, TXValue, TYValue>,
  ): TRendered
}

/** Owns the renderer-neutral Angular host protocol; all query/input reads are deferred. */
export function injectChartHost<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
  TOptions extends ChartHostInputOptions<TDatum, TXValue, TYValue, TRendered>,
  TRendered,
>(
  host: ChartHostDeclarations<TDatum, TXValue, TYValue, TOptions, TRendered>,
  config: ChartHostRendererConfig<TDatum, TXValue, TYValue, TRendered>,
) {
  const domRenderer = inject(Renderer2)
  const isServer = inject(PLATFORM_ID) === 'server'
  const serverRender = inject(CHART_SERVER_RENDER)
  const generatedId = inject(ChartIdGenerator).next(config.id)
  const zone = inject(NgZone)
  // The core's listeners, observers, frames and timers never need change
  // detection. Angular already runs render hooks outside the zone, so only
  // consumer-driven operations need moving out; user code re-enters the zone.
  const outsideZone = <T>(work: () => T) =>
    untracked(() => zone.runOutsideAngular(work))
  const insideZone = (notify: () => void) => untracked(() => zone.run(notify))
  const interactions = new WeakMap<
    ChartInteractionController<TDatum, TXValue, TYValue>,
    ChartInteractionController<TDatum, TXValue, TYValue>
  >()
  const adaptInteraction = (
    controller: ChartInteractionController<TDatum, TXValue, TYValue>,
  ) => {
    const existing = interactions.get(controller)
    if (existing) return existing
    const interaction: ChartInteractionController<TDatum, TXValue, TYValue> = {
      clientToScene: (x, y) =>
        outsideZone(() => controller.clientToScene(x, y)),
      resolvePointer: (x, y) =>
        outsideZone(() => controller.resolvePointer(x, y)),
      setControlledFocus: (target, options) =>
        outsideZone(() => controller.setControlledFocus(target, options)),
    }
    interactions.set(controller, interaction)
    return interaction
  }
  // The core compares this callback by identity to decide whether the body
  // changed owner, so it is rebuilt only with the projected directive.
  const tooltipBodyChange = computed(() => {
    const body = config.tooltipBody()
    return (
      body &&
      ((target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null) =>
        insideZone(() => body.render(target)))
    )
  })
  const options = computed(() => {
    const input = host.options()
    const {
      onRender,
      onFocusChange,
      onFocusGroupChange,
      onSelect,
      ...options
    } = input
    return {
      ...options,
      renderer: config.renderer(),
      idPrefix: options.idPrefix ?? generatedId,
      // Angular cannot tell whether `rendered` has listeners, so the context is
      // always adapted. This runs once per full scene render, not per frame.
      onRender: (context) =>
        insideZone(() => {
          const rendered = config.toRenderContext({
            ...context,
            interaction: adaptInteraction(context.interaction),
          })
          onRender?.(rendered)
          host.rendered.emit(rendered)
        }),
      onFocusChange: (point) =>
        insideZone(() => {
          onFocusChange?.(point)
          host.focusChange.emit(point)
        }),
      onFocusGroupChange: (points) =>
        insideZone(() => {
          onFocusGroupChange?.(points)
          host.focusGroupChange.emit(points)
        }),
      onSelect: (point) =>
        insideZone(() => {
          onSelect?.(point)
          host.pointSelect.emit(point)
        }),
      onTooltipBodyChange: tooltipBodyChange(),
    } satisfies ChartRendererHostOptions<TDatum, TXValue, TYValue>
  })
  const layout = computed(() => resolveChartAdapterLayout(options()))
  const height = computed(
    () => options().height ?? (layout().aspectRatio === undefined ? 320 : null),
  )
  const getAdapter = injectChartRendererAdapter(options)
  let mounted = false
  const render = () => {
    const current = options()
    const surface = config.surface()
    if (!surface) return
    untracked(() => {
      const adapter = getAdapter()
      adapter.update(current)
      if (isServer) {
        domRenderer.setProperty(
          surface.nativeElement,
          'innerHTML',
          adapter.prerender(),
        )
      } else if (!mounted) {
        mounted = true
        adapter.mount(surface.nativeElement)
      }
    })
  }
  // The core measures and writes DOM together; only scheduling differs by platform.
  if (isServer) serverRender(render)
  else afterRenderEffect({ mixedReadWrite: render })
  return { layout, height }
}
