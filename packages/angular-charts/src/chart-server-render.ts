import { InjectionToken, effect } from '@angular/core'

/** Called in each chart's injection context to schedule its server rendering. */
export type ChartServerRenderStrategy = (render: () => void) => void

export const CHART_SERVER_RENDER =
  new InjectionToken<ChartServerRenderStrategy>('', {
    providedIn: 'root',
    factory: () => (render) => {
      effect(render)
    },
  })
