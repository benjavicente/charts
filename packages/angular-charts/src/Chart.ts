import {
  APP_ID,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  PLATFORM_ID,
  TemplateRef,
  ViewContainerRef,
  ViewEncapsulation,
  afterNextRender,
  computed,
  contentChild,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core'
import { DomSanitizer } from '@angular/platform-browser'
import type { EmbeddedViewRef } from '@angular/core'
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
    <ng-container #tooltipOutlet></ng-container>
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

  // Prerendering is only the initial SSR/client seed. Live changes are
  // applied by adapter.update(), so this must not track the options signal.
  protected readonly initialMarkup = computed(() =>
    this.#sanitizer.bypassSecurityTrustHtml(
      untracked(() => this.#adapter().prerender()),
    ),
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
  readonly #destroyRef = inject(DestroyRef)
  readonly #platformId = inject(PLATFORM_ID)
  readonly #generatedId = inject(ChartIdGenerator).next()

  protected readonly surface =
    viewChild.required<ElementRef<HTMLElement>>('surface')
  protected readonly tooltipOutlet = viewChild.required('tooltipOutlet', {
    read: ViewContainerRef,
  })
  protected readonly defaultTooltipBody =
    viewChild.required<TemplateRef<unknown>>('defaultTooltipBody')
  protected readonly tooltipBodyDirective = contentChild<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  >(ChartTooltipBodyDirective)
  #activeTooltipBody?: ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  #tooltipBodyContext?: ChartTooltipBodyTemplateContext<
    TDatum,
    TXValue,
    TYValue
  >
  #tooltipBodyView?: EmbeddedViewRef<
    ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>
  >

  readonly #renderSvg = computed(
    () => this.options().renderSvg ?? renderChartSvg,
  )
  readonly #renderer = computed(() =>
    createSvgChartRenderer<TDatum, TXValue, TYValue>(this.#renderSvg()),
  )
  readonly #hostOptions = computed(() => {
    const options = this.options()
    return toHostOptions(
      options,
      options.idPrefix ?? this.#generatedId,
      this.#renderer(),
      this.tooltipBodyDirective() ? this.#handleTooltipBodyChange : undefined,
    )
  })
  // The adapter is a mutable controller, not derived application state. Keep
  // one instance like Solid's local adapter and synchronize it in the effect.
  readonly #adapter = computed(() =>
    untracked(() => createChartRendererAdapter(this.#hostOptions())),
  )

  constructor() {
    effect(() => {
      this.#adapter().update(this.#hostOptions())
    })
    effect(() => {
      const tooltipBody = this.tooltipBodyDirective()
      this.#syncTooltipBody(tooltipBody)
    })
    // Angular does not invoke afterNextRender callbacks during SSR.
    afterNextRender({
      write: () => {
        // Keep the explicit check for DOM-emulating test runners, which can
        // execute render callbacks while using the server renderer.
        if (this.#platformId !== 'browser') return
        this.#adapter().mount(this.surface().nativeElement)
      },
    })
    this.#destroyRef.onDestroy(() => {
      this.#adapter().destroy()
      this.#destroyTooltipBodyView()
    })
  }

  #syncTooltipBody(
    tooltipBody:
      ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined,
  ) {
    const tooltipBodyChanged = tooltipBody !== this.#activeTooltipBody
    if (tooltipBodyChanged) {
      this.#destroyTooltipBodyView()
      this.#activeTooltipBody = tooltipBody
    }
    const target = this.#tooltipBodyTarget()
    if (tooltipBodyChanged && tooltipBody && target) {
      this.#renderTooltipBody(target)
    }
  }

  readonly #handleTooltipBodyChange = (
    target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null,
  ) => {
    this.#tooltipBodyTarget.set(target)
    if (!target) {
      this.#destroyTooltipBodyView()
      return
    }
    this.#renderTooltipBody(target)
  }

  #renderTooltipBody(target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue>) {
    const directive = this.#activeTooltipBody
    if (!directive) return

    this.#tooltipBodyContext ??= this.#createTooltipBodyContext()
    if (!this.#tooltipBodyView) {
      this.#tooltipBodyView = this.tooltipOutlet().createEmbeddedView(
        directive.templateRef,
        this.#tooltipBodyContext,
      )
    }
    // This is the same logical-view arrangement used by Angular CDK's
    // TemplatePortal + DomPortalOutlet, kept local to avoid a CDK dependency.
    for (const node of this.#tooltipBodyView.rootNodes) {
      target.element.append(node)
    }
    this.#tooltipBodyView.detectChanges()
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

  #destroyTooltipBodyView() {
    const view = this.#tooltipBodyView
    if (!view) return
    const index = this.tooltipOutlet().indexOf(view)
    if (index === -1) view.destroy()
    else this.tooltipOutlet().remove(index)
    this.#tooltipBodyView = undefined
  }
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
