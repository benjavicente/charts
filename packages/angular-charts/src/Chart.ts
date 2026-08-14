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
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal'
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
import type { EmbeddedViewRef, Signal } from '@angular/core'
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

function untrackedComputed<T>(computation: () => T) {
  return computed(() => untracked(computation))
}

@Component({
  selector: 'div[tanstack-chart]',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'ts-chart-host',
    '[style]': 'hostStyle()',
  },
  template: `
    <div
      #surface
      class="ts-chart-surface"
      style="width: 100%; height: 100%"
      [innerHTML]="initialMarkup()"
    ></div>
    <ng-container #tooltipOutlet></ng-container>
    <ng-content select="ng-template[tanstackChartTooltipBody]" />
    <ng-template #defaultTooltipBody>
      @if (tooltipBody.defaultTooltipText() !== undefined) {
        {{ tooltipBody.defaultTooltipText() }}
      } @else if (tooltipBody.defaultTooltipContent(); as content) {
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
  readonly #sanitizer = inject(DomSanitizer)
  readonly #destroyRef = inject(DestroyRef)
  readonly #platformId = inject(PLATFORM_ID)
  readonly #generatedId = inject(ChartIdGenerator).next()

  readonly options = input.required<ChartOptions<TDatum, TXValue, TYValue>>()

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

  protected readonly tooltipBody = injectChartTooltipBody({
    directive: this.tooltipBodyDirective,
    outlet: this.tooltipOutlet,
    defaultBody: this.defaultTooltipBody,
  })

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
      this.tooltipBodyDirective() ? this.tooltipBody.onTargetChange : undefined,
    )
  })
  readonly #adapter = untrackedComputed(() =>
    createChartRendererAdapter(this.#hostOptions()),
  )

  protected readonly initialMarkup = untrackedComputed(() =>
    this.#sanitizer.bypassSecurityTrustHtml(this.#adapter().prerender()),
  )
  protected readonly hostStyle = computed(() =>
    resolveChartHostStyle(this.options()),
  )

  constructor() {
    effect(() => {
      this.#adapter().update(this.#hostOptions())
    })
    afterNextRender({
      write: () => {
        if (this.#platformId !== 'browser') return
        this.#adapter().mount(this.surface().nativeElement)
      },
    })
    this.#destroyRef.onDestroy(() => {
      this.#adapter().destroy()
    })
  }
}

function injectChartTooltipBody<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(options: {
  directive: Signal<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined
  >
  outlet: Signal<ViewContainerRef>
  defaultBody: Signal<TemplateRef<unknown>>
}) {
  const destroyRef = inject(DestroyRef)
  const target = signal<ChartTooltipBodyTarget<
    TDatum,
    TXValue,
    TYValue
  > | null>(null)

  const defaultTooltipContent = computed(() => {
    const content = target()?.content
    return typeof content === 'string' ? undefined : content
  })
  const defaultTooltipText = computed(() => {
    const content = target()?.content
    return typeof content === 'string' ? content : undefined
  })

  let activeDirective:
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined
  let context:
    ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue> | undefined
  let outlet: DomPortalOutlet | undefined
  let view:
    | EmbeddedViewRef<ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>>
    | undefined

  const destroy = () => {
    outlet?.dispose()
    outlet = undefined
    view = undefined
  }

  const createContext = () => {
    const tooltipContext = {
      get points() {
        return target()?.points ?? []
      },
      get content() {
        return target()?.content ?? ''
      },
      get defaultBody() {
        return options.defaultBody()
      },
      get pinned() {
        return target()?.pinned ?? false
      },
      get dismiss() {
        return target()?.dismiss ?? (() => {})
      },
    } as ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>
    tooltipContext.$implicit = tooltipContext
    return tooltipContext
  }

  const render = (
    nextTarget: ChartTooltipBodyTarget<TDatum, TXValue, TYValue>,
  ) => {
    const directive = activeDirective
    if (!directive) return

    if (outlet && outlet.outletElement !== nextTarget.element) {
      destroy()
    }

    context ??= createContext()
    if (!outlet) {
      const portal = new TemplatePortal(
        directive.templateRef,
        options.outlet(),
        context,
      )
      outlet = new DomPortalOutlet(nextTarget.element)
      view = outlet.attach(portal)
    }

    view?.detectChanges()
  }

  const onTargetChange = (
    nextTarget: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null,
  ) => {
    target.set(nextTarget)
    if (!nextTarget) {
      destroy()
      return
    }
    render(nextTarget)
  }

  effect(() => {
    const directive = options.directive()
    const directiveChanged = directive !== activeDirective
    if (directiveChanged) {
      destroy()
      activeDirective = directive
    }

    const currentTarget = untracked(() => target())
    if (directiveChanged && directive && currentTarget) {
      render(currentTarget)
    }
  })
  destroyRef.onDestroy(destroy)

  return {
    target,
    defaultTooltipContent,
    defaultTooltipText,
    onTargetChange,
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
  return `display:block;position:relative;width:${width};${size}`
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
  const { renderSvg: _renderSvg, onRender, ...hostOptions } = options
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
