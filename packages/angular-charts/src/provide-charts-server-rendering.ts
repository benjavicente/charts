import {
  DestroyRef,
  ErrorHandler,
  Injectable,
  inject,
  makeEnvironmentProviders,
  untracked,
} from '@angular/core'
import type { EnvironmentProviders } from '@angular/core'
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server'
import { CHART_SERVER_RENDER } from '@tanstack/angular-charts'
import type { ChartServerRenderStrategy } from '@tanstack/angular-charts'

@Injectable()
class ChartSerializationQueue {
  readonly renders = new Set<() => void>()
}

/** Render live charts once, after application stability and before SSR serialization. */
export function provideChartsServerRendering(): EnvironmentProviders {
  return makeEnvironmentProviders([
    ChartSerializationQueue,
    {
      provide: CHART_SERVER_RENDER,
      useFactory: (): ChartServerRenderStrategy => {
        const queue = inject(ChartSerializationQueue)
        return (render) => {
          const owner = inject(DestroyRef)
          const renderOnce = () => untracked(render)
          queue.renders.add(renderOnce)
          owner.onDestroy(() => queue.renders.delete(renderOnce))
        }
      },
    },
    {
      provide: BEFORE_APP_SERIALIZED,
      multi: true,
      useFactory: () => {
        const queue = inject(ChartSerializationQueue)
        const errors = inject(ErrorHandler)
        return () => {
          try {
            for (const render of queue.renders) {
              try {
                render()
              } catch (error) {
                errors.handleError(error)
              }
            }
          } finally {
            queue.renders.clear()
          }
        }
      },
    },
  ])
}
