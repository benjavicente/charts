import { defineChart, dot, lineY, ruleY } from '@tanstack/charts'
import { tooltip } from '@tanstack/charts/tooltip'
import { portal } from '@tanstack/charts/tooltip/portal'
import type { ChartHostOptions } from '@tanstack/charts'
import { scaleLinear } from 'd3-scale'

export interface RevenueDatum {
  id: string
  month: string
  x: number
  revenue: number
}

export const revenueData: readonly RevenueDatum[] = [
  { id: 'a', month: 'January', x: 0, revenue: 24 },
  { id: 'b', month: 'February', x: 1, revenue: 42 },
  { id: 'c', month: 'March', x: 2, revenue: 31 },
  { id: 'd', month: 'April', x: 3, revenue: 58 },
]

// Framework-agnostic: both columns receive these exact definitions and rows.
export function createRevenueChart(data: readonly RevenueDatum[]) {
  return defineChart({
    marks: [
      ruleY([0], { strokeOpacity: 0.2 }),
      lineY(data, {
        id: 'revenue',
        x: 'x',
        y: 'revenue',
        key: 'id',
        stroke: 'var(--ts-chart-1, #7c3aed)',
        strokeWidth: 2.5,
      }),
      dot(data, {
        id: 'revenue-points',
        x: 'x',
        y: 'revenue',
        key: 'id',
        r: 4,
        fill: 'var(--ts-chart-1, #7c3aed)',
      }),
    ],
    scales: {
      x: {
        scale: scaleLinear().domain([0, 3]),
        axis: {
          ticks: {
            values: [0, 1, 2, 3],
            format: (value) => data[Number(value)]?.month.slice(0, 3) ?? '',
          },
        },
      },
      y: {
        scale: scaleLinear().domain([0, 80]),
        grid: true,
        axis: { label: 'Revenue ($k)', ticks: { count: 4 } },
      },
    },
  })
}

export type ComparisonOptions = ChartHostOptions<RevenueDatum, number, number>
export type CaseKind = 'tooltip' | 'effect' | 'host' | 'lifetime'
export interface ComparisonCase {
  kind: CaseKind
  title: string
  description: string
  options: ComparisonOptions
}

const definition = createRevenueChart(revenueData)
const tooltipDefinition = defineChart(definition, {
  tooltip: {
    use: tooltip,
    portal,
    format: (point) => point.datum.month + ' · $' + point.datum.revenue + 'k',
  },
})

export const comparisonCases: readonly ComparisonCase[] = [
  {
    kind: 'tooltip',
    title: '01 · A tooltip should follow its primary point',
    description:
      'Choose January, then February without hiding the tooltip. The primary point and the current content should name the same month.',
    options: {
      definition: tooltipDefinition,
      height: 240,
      ariaLabel: 'Tooltip revenue',
    },
  },
  {
    kind: 'effect',
    title: '02 · Logging should not become a focus dependency',
    description:
      'Focus a month, then change the logging format. The callback reads that preference; it should not make the focus effect run again.',
    options: { definition, height: 220, ariaLabel: 'Controlled revenue' },
  },
  {
    kind: 'host',
    title: '03 · One element should own identity and layout',
    description:
      'The same ID, data attribute, class and height binding target each host. The CSS selector expects them on the layout element.',
    options: { definition, ariaLabel: 'Host styling revenue' },
  },
  {
    kind: 'lifetime',
    title: '04 · Reactive inputs and a stable lifetime',
    description:
      'Update the shared data and dimensions, then unmount and remount both charts. Each adapter should update in place and release its resources.',
    options: { definition, height: 240, ariaLabel: 'Reactive revenue' },
  },
]
