import {
  APP_ID,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  PLATFORM_ID,
  Renderer2,
  ViewContainerRef,
  ViewEncapsulation,
  afterNextRender,
  afterRenderEffect,
  computed,
  contentChild,
  effect,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core'
import { resolveChartAdapterLayout } from '@tanstack/charts/adapter'
import { injectChartRendererAdapter } from './inject-chart-renderer-adapter'
import { renderChartSvg } from '@tanstack/charts/svg'
import { createSvgChartRenderer } from '@tanstack/charts/svg/renderer'
import type {
  ChartInteractionController,
  ChartPoint,
  ChartRenderContext,
  ChartRendererHostOptions,
  ChartRendererRenderContext,
  ChartValue,
} from '@tanstack/charts'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import { injectChartTooltipBody } from './inject-chart-tooltip-body'
import type { ChartOptions } from './types'

@Injectable({ providedIn: 'root' })
class ChartIdGenerator {
  readonly #appId = inject(APP_ID)
  #nextId = 0

  next() {
    return (
      'ts-chart-component-' +
      this.#appId +
      '-' +
      ++this.#nextId
    ).replaceAll(/[^a-zA-Z0-9_-]/g, '')
  }
}

@Component({
  selector: 'div[tanstack-chart]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ts-chart-host',
    style: 'position: relative; width: 100%',
    '[style.width.px]': 'options().width',
    '[style.height.px]': 'hostHeight()',
    '[style.aspect-ratio]':
      'options().height === undefined ? layout().aspectRatio : null',
  },
  template: `
    <div
      #surface
      class="ts-chart-surface"
      style="width: 100%; height: 100%"
    ></div>
    <ng-template #tooltipOutlet />
    <ng-content select="ng-template[tanstackChartTooltipBody]" />
  `,
})
export class Chart<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> {
  readonly options = input.required<ChartOptions<TDatum, TXValue, TYValue>>()

  readonly rendered = output<ChartRenderContext<TDatum, TXValue, TYValue>>()
  readonly focusChange = output<ChartPoint<TDatum, TXValue, TYValue> | null>()
  readonly focusGroupChange =
    output<readonly ChartPoint<TDatum, TXValue, TYValue>[]>()
  readonly pointSelect = output<ChartPoint<TDatum, TXValue, TYValue> | null>()

  // The optional query lets the server effect wait for template creation.
  // Browser DOM work also waits until the query is available after rendering.
  protected readonly surface = viewChild<ElementRef<HTMLElement>>('surface')
  protected readonly tooltipBodyDirective = contentChild<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  >(ChartTooltipBodyDirective)
  protected readonly layout = computed(() =>
    resolveChartAdapterLayout(this.options()),
  )
  protected readonly hostHeight = computed(
    () =>
      this.options().height ??
      (this.layout().aspectRatio === undefined ? 320 : null),
  )
  protected readonly tooltipOutlet = viewChild.required('tooltipOutlet', {
    read: ViewContainerRef,
  })
  readonly #tooltipBody = injectChartTooltipBody(
    this.tooltipOutlet,
    this.tooltipBodyDirective,
  )

  readonly #domRenderer = inject(Renderer2)
  readonly #platformId = inject(PLATFORM_ID)
  readonly #generatedId = inject(ChartIdGenerator).next()
  readonly #renderSvg = computed(
    () => this.options().renderSvg ?? renderChartSvg,
  )
  readonly #renderer = computed(() =>
    createSvgChartRenderer<TDatum, TXValue, TYValue>(this.#renderSvg()),
  )
  readonly #interactions = new WeakMap<
    ChartInteractionController<TDatum, TXValue, TYValue>,
    ChartInteractionController<TDatum, TXValue, TYValue>
  >()
  readonly #hostOptions = computed(() => {
    const options = this.options()
    const {
      renderSvg: _renderSvg,
      svgClass,
      onRender,
      onFocusChange,
      onFocusGroupChange,
      onSelect,
      ...hostOptions
    } = options
    return {
      ...hostOptions,
      className: svgClass,
      idPrefix: options.idPrefix ?? this.#generatedId,
      renderer: this.#renderer(),
      onRender: (
        context: ChartRendererRenderContext<TDatum, TXValue, TYValue>,
      ) =>
        untracked(() => {
          const svg = context.surface.defaultElement ?? context.surface.element
          const SvgElement =
            context.container.ownerDocument.defaultView?.SVGSVGElement
          if (!SvgElement || !(svg instanceof SvgElement)) {
            throw new TypeError('Expected the SVG chart surface.')
          }
          const rendered = {
            ...context,
            svg,
            interaction: this.#adaptInteraction(context.interaction),
          }
          onRender?.(rendered)
          this.rendered.emit(rendered)
        }),
      onFocusChange: (point) =>
        untracked(() => {
          onFocusChange?.(point)
          this.focusChange.emit(point)
        }),
      onFocusGroupChange: (points) =>
        untracked(() => {
          onFocusGroupChange?.(points)
          this.focusGroupChange.emit(points)
        }),
      onSelect: (point) =>
        untracked(() => {
          onSelect?.(point)
          this.pointSelect.emit(point)
        }),
      onTooltipBodyChange: this.tooltipBodyDirective()
        ? this.#tooltipBody
        : undefined,
    } satisfies ChartRendererHostOptions<TDatum, TXValue, TYValue>
  })
  readonly #getAdapter = injectChartRendererAdapter(this.#hostOptions)

  constructor() {
    const isServer = this.#platformId === 'server'
    const updateOptions = () => {
      const options = this.#hostOptions()
      const surface = this.surface()
      if (!surface) return
      untracked(() => {
        const adapter = this.#getAdapter()
        adapter.update(options)
        if (isServer) {
          // SSR serializes current options without mounting or measuring DOM.
          this.#domRenderer.setProperty(
            surface.nativeElement,
            'innerHTML',
            adapter.prerender(),
          )
        }
      })
    }
    // Only scheduling differs: both platforms execute the same update callback.
    // The mounted core mixes DOM measurements and writes in a single operation.
    const registerOptionsEffect = isServer
      ? effect
      : (callback: () => void) =>
          afterRenderEffect({ mixedReadWrite: callback })
    registerOptionsEffect(updateOptions)

    afterNextRender({
      mixedReadWrite: () =>
        untracked(() => {
          // Mount directly for CSR; the renderer adopts existing SVG during hydration.
          const surface = this.surface()
          if (surface) this.#getAdapter().mount(surface.nativeElement)
        }),
    })
  }

  #adaptInteraction(
    controller: ChartInteractionController<TDatum, TXValue, TYValue>,
  ) {
    const existing = this.#interactions.get(controller)
    if (existing) return existing
    const interaction: ChartInteractionController<TDatum, TXValue, TYValue> = {
      clientToScene: (x, y) => untracked(() => controller.clientToScene(x, y)),
      resolvePointer: (x, y) =>
        untracked(() => controller.resolvePointer(x, y)),
      setControlledFocus: (target, options) =>
        untracked(() => controller.setControlledFocus(target, options)),
    }
    this.#interactions.set(controller, interaction)
    return interaction
  }
}
