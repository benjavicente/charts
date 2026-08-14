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
  viewChild,
} from '@angular/core'
import type { EmbeddedViewRef } from '@angular/core'
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
  ChartTooltipContent,
  ChartValue,
} from '@tanstack/charts'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import type { ChartOptions, ChartTooltipBodyTemplateContext } from './types'

@Injectable({ providedIn: 'root' })
class ChartIdGenerator {
  private readonly appId = inject(APP_ID)
  private nextId = 0

  next() {
    return `ts-chart-${this.appId}-${++this.nextId}`.replaceAll(
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

  protected readonly initialMarkup = signal<SafeHtml | string>('')
  protected readonly hostStyle = computed(() => {
    const options = this.options()
    const layout = resolveChartAdapterLayout(options)
    return [
      'position:relative',
      `width:${options.width === undefined ? '100%' : `${options.width}px`}`,
      options.height !== undefined
        ? `height:${options.height}px`
        : layout.aspectRatio === undefined
          ? 'height:320px'
          : `aspect-ratio:${layout.aspectRatio}`,
      options.style,
    ]
      .filter(Boolean)
      .join(';')
  })
  protected readonly defaultTooltipContent = signal<
    ChartTooltipContent | undefined
  >(undefined)
  protected readonly defaultTooltipText = signal<string | undefined>(undefined)

  private readonly sanitizer = inject(DomSanitizer)
  private readonly destroyRef = inject(DestroyRef)
  private readonly generatedId = inject(ChartIdGenerator).next()
  private readonly surface =
    viewChild.required<ElementRef<HTMLElement>>('surface')
  private readonly tooltipOutlet = viewChild.required('tooltipOutlet', {
    read: ViewContainerRef,
  })
  private readonly defaultTooltipBody =
    viewChild.required<TemplateRef<unknown>>('defaultTooltipBody')
  private readonly tooltipBodyDirective = contentChild<
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue>
  >(ChartTooltipBodyDirective)
  private adapter?: ChartAdapter<
    ChartRendererHostOptions<TDatum, TXValue, TYValue>,
    TDatum,
    TXValue,
    TYValue
  >
  private activeRenderSvg?: ChartSvgRenderer<TDatum, TXValue, TYValue>
  private renderer?: ChartRenderer<TDatum, TXValue, TYValue>
  private activeTooltipBody?: ChartTooltipBodyDirective<
    TDatum,
    TXValue,
    TYValue
  >
  private tooltipBodyTarget?: ChartTooltipBodyTarget<TDatum, TXValue, TYValue>
  private tooltipBodyView?: EmbeddedViewRef<
    ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>
  >

  constructor() {
    effect(() => {
      this.updateAdapter(this.options(), this.tooltipBodyDirective())
    })
    if (inject(PLATFORM_ID) === 'browser') {
      afterNextRender({
        write: () => {
          this.adapter?.mount(this.surface().nativeElement)
        },
      })
    }
    this.destroyRef.onDestroy(() => {
      this.adapter?.destroy()
      this.destroyTooltipBodyView()
    })
  }

  private updateAdapter(
    options: ChartOptions<TDatum, TXValue, TYValue>,
    tooltipBody:
      ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined,
  ) {
    const tooltipBodyChanged = tooltipBody !== this.activeTooltipBody
    if (tooltipBodyChanged) {
      this.destroyTooltipBodyView()
      this.activeTooltipBody = tooltipBody
    }
    const hostOptions = toHostOptions(
      options,
      options.idPrefix ?? this.generatedId,
      this.resolveRenderer(options.renderSvg ?? renderChartSvg),
      tooltipBody ? this.handleTooltipBodyChange : undefined,
    )
    if (!this.adapter) {
      this.adapter = createChartRendererAdapter(hostOptions)
      this.initialMarkup.set(
        this.sanitizer.bypassSecurityTrustHtml(this.adapter.prerender()),
      )
    } else {
      this.adapter.update(hostOptions)
    }
    if (tooltipBodyChanged && tooltipBody && this.tooltipBodyTarget) {
      this.renderTooltipBody(this.tooltipBodyTarget)
    }
  }

  private resolveRenderer(
    renderSvg: ChartSvgRenderer<TDatum, TXValue, TYValue>,
  ) {
    if (!this.renderer || renderSvg !== this.activeRenderSvg) {
      this.activeRenderSvg = renderSvg
      this.renderer = createSvgChartRenderer(renderSvg)
    }
    return this.renderer
  }

  private readonly handleTooltipBodyChange = (
    target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null,
  ) => {
    if (!target) {
      this.tooltipBodyTarget = undefined
      this.destroyTooltipBodyView()
      return
    }
    this.tooltipBodyTarget = target
    this.renderTooltipBody(target)
  }

  private renderTooltipBody(
    target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue>,
  ) {
    const directive = this.activeTooltipBody
    if (!directive) return
    this.defaultTooltipText.set(
      typeof target.content === 'string' ? target.content : undefined,
    )
    this.defaultTooltipContent.set(
      typeof target.content === 'string' ? undefined : target.content,
    )

    const context = this.tooltipBodyView?.context
    if (context) {
      context.points = target.points
      context.content = target.content
      context.defaultBody = this.defaultTooltipBody()
      context.pinned = target.pinned
      context.dismiss = target.dismiss
      this.moveTooltipBodyView(target.element)
      this.tooltipBodyView?.detectChanges()
      return
    }

    const nextContext = {
      points: target.points,
      content: target.content,
      defaultBody: this.defaultTooltipBody(),
      pinned: target.pinned,
      dismiss: target.dismiss,
    } as ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>
    nextContext.$implicit = nextContext
    this.tooltipBodyView = this.tooltipOutlet().createEmbeddedView(
      directive.templateRef,
      nextContext,
    )
    this.moveTooltipBodyView(target.element)
    this.tooltipBodyView.detectChanges()
  }

  private moveTooltipBodyView(target: HTMLElement) {
    for (const node of this.tooltipBodyView?.rootNodes ?? []) {
      target.append(node)
    }
  }

  private destroyTooltipBodyView() {
    const view = this.tooltipBodyView
    if (!view) return
    const nodes = [...view.rootNodes] as Node[]
    const index = this.tooltipOutlet().indexOf(view)
    if (index === -1) view.destroy()
    else this.tooltipOutlet().remove(index)
    for (const node of nodes) node.parentNode?.removeChild(node)
    this.tooltipBodyView = undefined
  }
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
