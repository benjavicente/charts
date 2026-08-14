import {
  APP_ID,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injectable,
  PLATFORM_ID,
  TemplateRef,
  ViewContainerRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  contentChild,
  createComponent,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import type { SafeHtml } from '@angular/platform-browser'
import { resolveChartAdapterLayout } from '@tanstack/charts/adapter'
import { createChartRendererAdapter } from '@tanstack/charts/adapter/renderer'
import { renderChartSvg } from '@tanstack/charts/svg'
import { createSvgChartRenderer } from '@tanstack/charts/svg/renderer'
import type {
  ChartAdapter,
  ChartRenderer,
  ChartRendererHostOptions,
  ChartRendererRenderContext,
  ChartSvgRenderer,
  ChartTooltipBodyTarget,
  ChartValue,
} from '@tanstack/charts'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import type { ChartOptions, ChartTooltipBodyTemplateContext } from './types'

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

@Component({
  standalone: true,
  template: '<ng-container #outlet />',
})
class ChartTooltipBodyOutlet {
  protected readonly outlet = viewChild.required('outlet', {
    read: ViewContainerRef,
  })

  render<TContext>(template: TemplateRef<TContext>, context: TContext) {
    const outlet = this.outlet()
    if (outlet.length === 0) {
      outlet.createEmbeddedView(template, context)
    }
    outlet.get(0)?.detectChanges()
  }

  clear() {
    this.outlet().clear()
  }
}

@Component({
  selector: 'tanstack-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="ts-chart-host" [class]="options().class" [style]="hostStyle()">
      <div
        #surface
        class="ts-chart-surface"
        style="width: 100%; height: 100%"
        [innerHTML]="initialMarkup()"
      ></div>
    </div>
    <ng-content select="ng-template[tanstackChartTooltipBody]" />
    <ng-template #defaultTooltipBody>
      @if (defaultTooltipText() !== undefined) {
        {{ defaultTooltipText() }}
      } @else if (defaultTooltipContent(); as content) {
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
  `,
})
export class Chart<
  TDatum = unknown,
  TXValue extends ChartValue = ChartValue,
  TYValue extends ChartValue = ChartValue,
> {
  readonly options = input.required<ChartOptions<TDatum, TXValue, TYValue>>()

  readonly #tooltipBodyTarget = signal<ChartTooltipBodyTarget<
    TDatum,
    TXValue,
    TYValue
  > | null>(null)

  protected readonly initialMarkup = computed(
    () => this.#adapterState().initialMarkup,
  )
  protected readonly hostStyle = computed(() =>
    resolveChartHostStyle(this.options()),
  )
  protected readonly defaultTooltipContent = computed(() => {
    const content = this.#tooltipBodyTarget()?.content
    return typeof content === 'string' ? undefined : content
  })
  protected readonly defaultTooltipText = computed(() => {
    const content = this.#tooltipBodyTarget()?.content
    return typeof content === 'string' ? content : undefined
  })

  readonly #sanitizer = inject(DomSanitizer)
  readonly #applicationRef = inject(ApplicationRef)
  readonly #destroyRef = inject(DestroyRef)
  readonly #environmentInjector = inject(EnvironmentInjector)
  readonly #platformId = inject(PLATFORM_ID)
  readonly #generatedId = inject(ChartIdGenerator).next()

  protected readonly surface =
    viewChild.required<ElementRef<HTMLElement>>('surface')
  protected readonly defaultTooltipBody =
    viewChild.required<TemplateRef<unknown>>('defaultTooltipBody')
  protected readonly tooltipBodyDirective = contentChild<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  >(ChartTooltipBodyDirective)
  #activeRenderSvg?: ChartSvgRenderer<TDatum, TXValue, TYValue>
  #renderer?: ChartRenderer<TDatum, TXValue, TYValue>
  #activeTooltipBody?: ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  #tooltipBodyContext?: ChartTooltipBodyTemplateContext<
    TDatum,
    TXValue,
    TYValue
  >
  #tooltipBodyOutlet?: ComponentRef<ChartTooltipBodyOutlet>
  #tooltipBodyElement?: HTMLElement

  readonly #adapterState = linkedSignal({
    source: () => ({
      options: this.options(),
      tooltipBody: this.tooltipBodyDirective(),
    }),
    computation: (
      { options, tooltipBody },
      previous,
    ): ChartAdapterState<TDatum, TXValue, TYValue> => {
      const hostOptions = toHostOptions(
        options,
        options.idPrefix ?? this.#generatedId,
        this.#resolveRenderer(options.renderSvg ?? renderChartSvg),
        tooltipBody ? this.#handleTooltipBodyChange : undefined,
      )
      if (previous) {
        previous.value.adapter.update(hostOptions)
        return previous.value
      }
      const adapter = createChartRendererAdapter(hostOptions)
      return {
        adapter,
        initialMarkup: this.#sanitizer.bypassSecurityTrustHtml(
          adapter.prerender(),
        ),
      }
    },
  })

  constructor() {
    effect(() => {
      // Read both source signals directly so updates are synchronized even
      // when the linked adapter state keeps the same adapter instance.
      this.options()
      const tooltipBody = this.tooltipBodyDirective()
      this.#adapterState()
      this.#syncTooltipBody(tooltipBody)
    })
    // Angular does not invoke afterNextRender callbacks during SSR.
    afterNextRender({
      write: () => {
        // Keep the explicit check for DOM-emulating test runners, which can
        // execute render callbacks while using the server renderer.
        if (this.#platformId !== 'browser') return
        this.#adapterState().adapter.mount(this.surface().nativeElement)
      },
    })
    this.#destroyRef.onDestroy(() => {
      this.#adapterState().adapter.destroy()
      this.#destroyTooltipBodyOutlet()
    })
  }

  #syncTooltipBody(
    tooltipBody:
      ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined,
  ) {
    const tooltipBodyChanged = tooltipBody !== this.#activeTooltipBody
    if (tooltipBodyChanged) {
      this.#destroyTooltipBodyOutlet()
      this.#activeTooltipBody = tooltipBody
    }
    const target = this.#tooltipBodyTarget()
    if (tooltipBodyChanged && tooltipBody && target) {
      this.#renderTooltipBody(target)
    }
  }

  #resolveRenderer(renderSvg: ChartSvgRenderer<TDatum, TXValue, TYValue>) {
    if (!this.#renderer || renderSvg !== this.#activeRenderSvg) {
      this.#activeRenderSvg = renderSvg
      this.#renderer = createSvgChartRenderer(renderSvg)
    }
    return this.#renderer
  }

  readonly #handleTooltipBodyChange = (
    target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null,
  ) => {
    this.#tooltipBodyTarget.set(target)
    if (!target) {
      this.#destroyTooltipBodyOutlet()
      return
    }
    this.#renderTooltipBody(target)
  }

  #renderTooltipBody(target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue>) {
    const directive = this.#activeTooltipBody
    if (!directive) return

    this.#tooltipBodyContext ??= this.#createTooltipBodyContext()
    let outlet = this.#tooltipBodyOutlet
    if (this.#tooltipBodyElement !== target.element) {
      this.#destroyTooltipBodyOutlet()
      outlet = createComponent(ChartTooltipBodyOutlet, {
        environmentInjector: this.#environmentInjector,
        hostElement: target.element,
      })
      this.#tooltipBodyOutlet = outlet
      this.#applicationRef.attachView(outlet.hostView)
      outlet.changeDetectorRef.detectChanges()
      this.#tooltipBodyElement = target.element
    }
    outlet?.instance.render(directive.templateRef, this.#tooltipBodyContext)
  }

  #createTooltipBodyContext() {
    const chart = this
    const context = {
      get points() {
        return chart.#tooltipBodyTarget()?.points ?? []
      },
      get content() {
        return chart.#tooltipBodyTarget()?.content ?? ''
      },
      get defaultBody() {
        return chart.defaultTooltipBody()
      },
      get pinned() {
        return chart.#tooltipBodyTarget()?.pinned ?? false
      },
      get dismiss() {
        return chart.#tooltipBodyTarget()?.dismiss ?? (() => {})
      },
    } as ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>
    context.$implicit = context
    return context
  }

  #destroyTooltipBodyOutlet() {
    const outlet = this.#tooltipBodyOutlet
    if (!outlet) return
    outlet.instance.clear()
    this.#applicationRef.detachView(outlet.hostView)
    outlet.destroy()
    this.#tooltipBodyOutlet = undefined
    this.#tooltipBodyElement = undefined
  }
}

type ChartAdapterState<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
> = {
  adapter: ChartAdapter<
    ChartRendererHostOptions<TDatum, TXValue, TYValue>,
    TDatum,
    TXValue,
    TYValue
  >
  initialMarkup: SafeHtml | string
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
