import {
  DestroyRef,
  inject,
  inputBinding,
  signal,
  untracked,
  ViewContainerRef,
} from '@angular/core'
import type { ComponentRef, TemplateRef, WritableSignal } from '@angular/core'
import type { ChartTooltipBodyTarget, ChartValue } from '@tanstack/charts'
import { ChartTooltipBodyComponent } from './chart-tooltip-body.component'
import type { ChartTooltipBodyTemplateContext } from '../types'

export function injectChartTooltipBody<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(
  template: TemplateRef<
    ChartTooltipBodyTemplateContext<TDatum, TXValue, TYValue>
  >,
) {
  const container = inject(ViewContainerRef)
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
      // The core measures and positions the tooltip right after this callback,
      // so the body view must reflect the target synchronously.
      if (body) {
        body.target.set(target)
        body.ref.changeDetectorRef.detectChanges()
        return
      }
      // Each body owns a non-null target signal for exactly its view lifetime.
      const currentTarget = signal(target)
      const ref = container.createComponent(
        ChartTooltipBodyComponent<TDatum, TXValue, TYValue>,
        {
          bindings: [
            inputBinding('target', currentTarget),
            inputBinding('template', () => template),
          ],
        },
      )
      target.element.append(ref.location.nativeElement)
      body = { ref, target: currentTarget }
      ref.changeDetectorRef.detectChanges()
    })
}
