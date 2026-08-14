import {
  APP_ID,
  DestroyRef,
  ElementRef,
  Injectable,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import { resolveChartAdapterLayout } from '@tanstack/charts/adapter'
import { createChartRendererAdapter } from '@tanstack/charts/adapter/renderer'
import { renderChartSvg } from '@tanstack/charts/svg'
import { createSvgChartRenderer } from '@tanstack/charts/svg/renderer'
import type {
  ChartRenderer,
  ChartRendererHostOptions,
  ChartRendererRenderContext,
  ChartTooltipBodyTarget,
  ChartValue,
} from '@tanstack/charts'
import type { Signal } from '@angular/core'
import type { SafeHtml } from '@angular/platform-browser'
import type { ChartTooltipBodyDirective } from './ChartTooltipBody'
import type { ChartOptions } from './types'

@Injectable({ providedIn: 'root' })
class ChartIdGenerator {
  readonly #appId = inject(APP_ID)
  #nextId = 0

  next() {
    return `ts-chart-${this.#appId}-${++this.#nextId}`.replaceAll(
      /[^a-zA-Z0-9_-]/g,
      '',
    )
  }
}

export function injectChartRenderer<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(options: {
  chartOptions: Signal<ChartOptions<TDatum, TXValue, TYValue>>
  surface: Signal<ElementRef<HTMLElement>>
  tooltipBody: Signal<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined
  >
  onTooltipBodyChange: (
    target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null,
  ) => void
}): {
  readonly initialMarkup: Signal<SafeHtml>
  readonly hostStyle: Signal<string>
} {
  const sanitizer = inject(DomSanitizer)
  const destroyRef = inject(DestroyRef)
  const platformId = inject(PLATFORM_ID)
  const generatedId = inject(ChartIdGenerator).next()

  const renderSvg = computed(
    () => options.chartOptions().renderSvg ?? renderChartSvg,
  )
  const renderer = computed(() =>
    createSvgChartRenderer<TDatum, TXValue, TYValue>(renderSvg()),
  )
  const hostOptions = computed(() => {
    const chartOptions = options.chartOptions()
    return toHostOptions(
      chartOptions,
      chartOptions.idPrefix ?? generatedId,
      renderer(),
      options.tooltipBody() ? options.onTooltipBodyChange : undefined,
    )
  })
  // The adapter is a mutable controller, not derived application state. Keep
  // one instance like Solid's local adapter and synchronize it in the effect.
  const adapter = computed(() =>
    // Do not let the adapter's initial options become a dependency of this
    // resource. Updates are synchronized explicitly below.
    untracked(() => createChartRendererAdapter(hostOptions())),
  )

  const initialMarkup = computed(() =>
    sanitizer.bypassSecurityTrustHtml(
      // Prerendering is only the initial SSR/client seed. Live changes are
      // applied by adapter.update(), so this must not track chartOptions.
      untracked(() => adapter().prerender()),
    ),
  )
  const hostStyle = computed(() =>
    resolveChartHostStyle(options.chartOptions()),
  )

  effect(() => {
    adapter().update(hostOptions())
  })
  // Angular does not invoke afterNextRender callbacks during SSR.
  afterNextRender({
    write: () => {
      // Keep the explicit check for DOM-emulating test runners, which can
      // execute render callbacks while using the server renderer.
      if (platformId !== 'browser') return
      adapter().mount(options.surface().nativeElement)
    },
  })
  destroyRef.onDestroy(() => adapter().destroy())

  return { initialMarkup, hostStyle }
}

function resolveChartHostStyle<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(options: ChartOptions<TDatum, TXValue, TYValue>) {
  const layout = resolveChartAdapterLayout(options)
  const width = options.width === undefined ? '100%' : `${options.width}px`
  const size =
    options.height !== undefined
      ? `height:${options.height}px`
      : layout.aspectRatio === undefined
        ? 'height:320px'
        : `aspect-ratio:${layout.aspectRatio}`
  return `position:relative;width:${width};${size}${options.style ? `;${options.style}` : ''}`
}

function toHostOptions<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(
  options: ChartOptions<TDatum, TXValue, TYValue>,
  idPrefix: string,
  renderer: ChartRenderer<TDatum, TXValue, TYValue>,
  onTooltipBodyChange:
    | ((
        target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null,
      ) => void)
    | undefined,
): ChartRendererHostOptions<TDatum, TXValue, TYValue> {
  const {
    class: _class,
    style: _style,
    renderSvg: _renderSvg,
    onRender,
    ...hostOptions
  } = options
  return {
    ...hostOptions,
    idPrefix,
    renderer,
    onRender: adaptOnRender(onRender),
    onTooltipBodyChange,
  }
}

function adaptOnRender<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(onRender: ChartOptions<TDatum, TXValue, TYValue>['onRender']) {
  if (!onRender) return undefined
  return (
    context: ChartRendererRenderContext<TDatum, TXValue, TYValue>,
  ): void => {
    const svg = context.surface.element
    const SvgElement =
      context.container.ownerDocument.defaultView?.SVGSVGElement
    if (!SvgElement || !(svg instanceof SvgElement)) {
      throw new TypeError('Expected the SVG chart surface.')
    }
    onRender({
      container: context.container,
      scene: context.scene,
      svg,
      interaction: context.interaction,
    })
  }
}
