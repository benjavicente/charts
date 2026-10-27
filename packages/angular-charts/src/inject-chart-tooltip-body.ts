import {
  DestroyRef,
  inject,
  inputBinding,
  signal,
  untracked,
} from '@angular/core'
import type {
  ComponentRef,
  ViewContainerRef,
  WritableSignal,
} from '@angular/core'
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
    | {
        ref: ComponentRef<ChartTooltipBodyComponent<TDatum, TXValue, TYValue>>
        target: WritableSignal<ChartTooltipBodyTarget<TDatum, TXValue, TYValue>>
      }
    | undefined

  const clear = () => {
    if (!body) return
    const current = body
    body = undefined
    current.ref.destroy()
  }
  inject(DestroyRef).onDestroy(() => untracked(clear))

  return (target: ChartTooltipBodyTarget<TDatum, TXValue, TYValue> | null) =>
    untracked(() => {
      if (!target) {
        clear()
        return
      }
      if (
        body &&
        body.ref.location.nativeElement.parentElement !== target.element
      )
        clear()
      if (body) {
        body.target.set(target)
        return
      }
      // Each body owns a non-null target signal for exactly its view lifetime.
      const currentTarget = signal(target)
      const ref = container().createComponent(
        ChartTooltipBodyComponent<TDatum, TXValue, TYValue>,
        {
          bindings: [
            inputBinding('target', currentTarget),
            inputBinding('template', () => directive()?.templateRef ?? null),
          ],
        },
      )
      target.element.append(ref.location.nativeElement)
      body = { ref, target: currentTarget }
    })
}
