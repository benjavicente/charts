import { DestroyRef, effect, inject, untracked } from '@angular/core'
import type { ComponentRef, ViewContainerRef } from '@angular/core'
import type { ChartTooltipBodyTarget, ChartValue } from '@tanstack/charts'
import { ChartTooltipBodyComponent } from './ChartTooltipBodyComponent'
import type { ChartTooltipBodyDirective } from './ChartTooltipBody'

export function injectChartTooltipBody<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(
  container: () => ViewContainerRef,
  directive: () =>
    ChartTooltipBodyDirective<TDatum, TXValue, TYValue> | undefined,
) {
  let body:
    | ComponentRef<ChartTooltipBodyComponent<TDatum, TXValue, TYValue>>
    | undefined

  // Projection can change without core emitting a new tooltip target.
  effect(() => {
    const template = directive()?.templateRef ?? null
    untracked(() => body?.setInput('template', template))
  })

  const clear = () => {
    if (!body) return
    const current = body
    body = undefined
    current.destroy()
  }
  inject(DestroyRef).onDestroy(() => untracked(clear))

  return (target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null) =>
    untracked(() => {
      if (!target) {
        clear()
        return
      }
      if (body && body.location.nativeElement.parentElement !== target.element)
        clear()
      if (!body) {
        // The chart owns the Angular view; core only owns its DOM destination.
        const created = container().createComponent(
          ChartTooltipBodyComponent<TDatum, TXValue, TYValue>,
        )
        target.element.append(created.location.nativeElement)
        body = created
      }
      body.setInput('template', directive()?.templateRef ?? null)
      body.setInput('target', target)
    })
}
