import { DestroyRef, inject, untracked } from '@angular/core'
import { createChartRendererAdapter } from '@tanstack/charts/adapter/renderer'
import type { ChartRendererHostOptions, ChartValue } from '@tanstack/charts'

/** Acquires one adapter at an imperative boundary and captures its disposal. */
export function injectChartRendererAdapter<
  TDatum,
  TXValue extends ChartValue,
  TYValue extends ChartValue,
>(options: () => ChartRendererHostOptions<TDatum, TXValue, TYValue>) {
  const owner = inject(DestroyRef)
  let adapter:
    | ReturnType<typeof createChartRendererAdapter<TDatum, TXValue, TYValue>>
    | undefined
  return () => {
    if (!adapter) {
      const created = untracked(() => createChartRendererAdapter(options()))
      owner.onDestroy(() => untracked(() => created.destroy()))
      adapter = created
    }
    return adapter
  }
}
