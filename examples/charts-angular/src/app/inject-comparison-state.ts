import { computed, effect, signal } from '@angular/core'
import type {
  ChartInteractionController,
  ChartPoint,
  ChartRenderContext,
} from '@tanstack/charts'
import type {
  ComparisonCase,
  ComparisonOptions,
  RevenueDatum,
} from './comparison-charts'

export function injectComparisonState(
  inputs: {
    scenario: () => ComparisonCase
    options: () => ComparisonOptions
    requestedPoint: () => string | null
    logFormat: () => 'short' | 'long'
    hostIdentity: () => 'revenue' | 'forecast'
    nativeHeight: () => number | undefined
    visible: () => boolean
  },
  adapter: 'original' | 'signal',
) {
  const controller = signal<ChartInteractionController<
    RevenueDatum,
    number,
    number
  > | null>(null)
  const points = signal<readonly ChartPoint<RevenueDatum, number, number>[]>([])
  const effectRuns = signal(0)
  const renderCount = signal(0)
  const sceneHeight = signal(0)
  const lastLog = signal('No focus callback yet')

  const onRender = (
    context: ChartRenderContext<RevenueDatum, number, number>,
  ) => {
    controller.set(context.interaction)
    points.set(context.scene.points)
    sceneHeight.set(context.scene.height)
    renderCount.update((count) => count + 1)
  }
  const onFocusChange = (
    point: ChartPoint<RevenueDatum, number, number> | null,
  ) => {
    if (inputs.scenario().kind !== 'effect') return
    // Intentionally read a signal in a consumer callback. It should not become
    // a dependency of the effect which invoked the interaction controller.
    const format = inputs.logFormat()
    lastLog.set(
      point
        ? format === 'short'
          ? point.datum.month
          : point.datum.month + ': $' + point.datum.revenue + 'k'
        : 'Focus cleared',
    )
  }

  effect(() => {
    const interaction = controller()
    const selected = inputs.requestedPoint()
    const available = points()
    if (!interaction || !selected) return
    const point = available.find((candidate) => candidate.datum.id === selected)
    if (!point) return
    effectRuns.update((count) => count + 1)
    interaction.setControlledFocus(point)
  })
  effect(() => {
    if (inputs.visible()) return
    controller.set(null)
    points.set([])
  })

  const hostId = computed(
    () => inputs.scenario().kind + '-' + inputs.hostIdentity() + '-' + adapter,
  )
  return {
    effectRuns,
    renderCount,
    sceneHeight,
    lastLog,
    hostId,
    hostClass: computed(() => 'comparison-host chart-' + hostId()),
    nativeHeight: computed(() =>
      inputs.nativeHeight() === undefined
        ? undefined
        : inputs.nativeHeight() + 'px',
    ),
    options: computed(() => ({
      ...inputs.options(),
      ariaLabel: inputs.options().ariaLabel + ' · ' + adapter,
      onRender,
      onFocusChange,
    })),
  }
}
