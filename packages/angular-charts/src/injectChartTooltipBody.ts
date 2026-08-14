import {
  DestroyRef,
  TemplateRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core'
import { DomPortalOutlet, TemplatePortal } from '@angular/cdk/portal'
import type { EmbeddedViewRef, Signal } from '@angular/core'
import type { ChartTooltipBodyTarget, ChartValue } from '@tanstack/charts'
import { ChartTooltipBodyDirective } from './ChartTooltipBody'
import type { ChartTooltipBodyTemplateContext } from './types'

export function injectChartTooltipBody<
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

    // The renderer can call this callback outside Angular's normal turn.
    // Keep updates immediate while CDK owns the portal lifecycle.
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

    // The target callback renders immediately; this effect only reconciles a
    // projected template appearing or changing. Do not subscribe it to target.
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
