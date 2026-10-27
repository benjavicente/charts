import {
  APP_ID,
  Injectable,
  PLATFORM_ID,
  Renderer2,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core'
import type {
  ElementRef,
  OutputEmitterRef,
  ViewContainerRef,
  Type,
} from '@angular/core'
import { resolveChartAdapterLayout } from '@tanstack/charts/adapter'
import type {
  ChartInteractionController,
  ChartPoint,
  ChartRendererHostOptions,
  ChartValue,
} from '@tanstack/charts'
import type { ChartTooltipBodyDirective } from './ChartTooltipBody'
import { injectChartRendererAdapter } from './inject-chart-renderer-adapter'
import { injectChartTooltipBody } from './inject-chart-tooltip-body'
import type { ChartTooltipBody } from './chart-tooltip-body'

@Injectable({ providedIn: 'root' })
class ChartIdGenerator {
  readonly #appId = inject(APP_ID)
  #nextId = 0

  // Secondary entry bundles can contain separate copies of this private service.
  next(namespace: string) {
    return `ts-chart-${namespace}-${this.#appId}-${++this.#nextId}`.replaceAll(
      /[^a-zA-Z0-9_-]/g,
      '',
    )
  }
}

/** Owns the renderer-neutral Angular host protocol; all query/input reads are deferred. */
export function injectChartHost<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(config: {
  options: () => ChartRendererHostOptions<TDatum, TXValue, TYValue>
  surface: () => ElementRef<HTMLElement> | undefined
  tooltipOutlet: () => ViewContainerRef
  tooltipDirective: () =>
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined
  tooltipComponent: Type<ChartTooltipBody<TDatum, TXValue, TYValue>>
  idNamespace: string
  focusChange: OutputEmitterRef<ChartPoint<TDatum, TXValue, TYValue> | null>
  focusGroupChange: OutputEmitterRef<
    readonly ChartPoint<TDatum, TXValue, TYValue>[]
  >
  pointSelect: OutputEmitterRef<ChartPoint<TDatum, TXValue, TYValue> | null>
}) {
  const domRenderer = inject(Renderer2)
  const isServer = inject(PLATFORM_ID) === 'server'
  const generatedId = inject(ChartIdGenerator).next(config.idNamespace)
  const tooltipBody = injectChartTooltipBody(
    config.tooltipOutlet,
    config.tooltipDirective,
    config.tooltipComponent,
  )
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
      clientToScene: (x, y) => untracked(() => controller.clientToScene(x, y)),
      resolvePointer: (x, y) =>
        untracked(() => controller.resolvePointer(x, y)),
      setControlledFocus: (target, options) =>
        untracked(() => controller.setControlledFocus(target, options)),
    }
    interactions.set(controller, interaction)
    return interaction
  }
  const options = computed(() => {
    const {
      onRender,
      onFocusChange,
      onFocusGroupChange,
      onSelect,
      ...options
    } = config.options()
    return {
      ...options,
      idPrefix: options.idPrefix ?? generatedId,
      onRender: (context) =>
        untracked(() =>
          onRender?.({
            ...context,
            interaction: adaptInteraction(context.interaction),
          }),
        ),
      onFocusChange: (point) =>
        untracked(() => {
          onFocusChange?.(point)
          config.focusChange.emit(point)
        }),
      onFocusGroupChange: (points) =>
        untracked(() => {
          onFocusGroupChange?.(points)
          config.focusGroupChange.emit(points)
        }),
      onSelect: (point) =>
        untracked(() => {
          onSelect?.(point)
          config.pointSelect.emit(point)
        }),
      onTooltipBodyChange: config.tooltipDirective() ? tooltipBody : undefined,
    } satisfies ChartRendererHostOptions<TDatum, TXValue, TYValue>
  })
  const layout = computed(() => resolveChartAdapterLayout(options()))
  const height = computed(
    () => options().height ?? (layout().aspectRatio === undefined ? 320 : null),
  )
  const getAdapter = injectChartRendererAdapter(options)
  const updateOptions = () => {
    const current = options()
    const surface = config.surface()
    if (!surface) return
    untracked(() => {
      const adapter = getAdapter()
      adapter.update(current)
      if (isServer)
        domRenderer.setProperty(
          surface.nativeElement,
          'innerHTML',
          adapter.prerender(),
        )
    })
  }
  // The core measures and writes DOM together; only scheduling differs by platform.
  if (isServer) effect(updateOptions)
  else afterRenderEffect({ mixedReadWrite: updateOptions })
  afterNextRender({
    mixedReadWrite: () =>
      untracked(() => {
        const surface = config.surface()
        if (surface) getAdapter().mount(surface.nativeElement)
      }),
  })
  return { layout, height }
}
