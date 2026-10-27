import {
  ChangeDetectionStrategy,
  Component,
  computed,
  signal,
} from '@angular/core'
import { OriginalExample } from './OriginalExample'
import { SignalExample } from './SignalExample'
import { CanvasExample } from './CanvasExample'
import {
  comparisonCases,
  createRevenueChart,
  revenueData,
} from './comparison-charts'
import type { ComparisonCase } from './comparison-charts'

@Component({
  selector: 'charts-angular-app',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OriginalExample, SignalExample, CanvasExample],
  templateUrl: './App.html',
})
export class App {
  readonly cases = comparisonCases
  readonly theme = signal<'light' | 'dark'>('light')
  readonly tooltipPoint = signal<string | null>('a')
  readonly effectPoint = signal<string | null>(null)
  readonly logFormat = signal<'short' | 'long'>('short')
  readonly hostIdentity = signal<'revenue' | 'forecast'>('revenue')
  readonly hostHeight = signal(180)
  readonly expanded = signal(false)
  readonly updatedData = signal(false)
  readonly canvasDots = signal(false)
  readonly visible = signal(true)
  readonly lifetimeOptions = computed(() => ({
    definition: createRevenueChart(
      this.updatedData()
        ? revenueData.map((row) => ({ ...row, revenue: row.revenue + 12 }))
        : revenueData,
      this.canvasDots(),
    ),
    height: this.expanded() ? 320 : 240,
    ariaLabel: 'Reactive revenue',
    className: 'revenue-surface',
  }))

  optionsFor(scenario: ComparisonCase) {
    return scenario.kind === 'lifetime'
      ? this.lifetimeOptions()
      : scenario.options
  }

  toggleTheme() {
    this.theme.update((theme) => (theme === 'light' ? 'dark' : 'light'))
    document.documentElement.dataset['theme'] = this.theme()
  }

  toggleData() {
    this.updatedData.update((value) => !value)
  }
  toggleDimensions() {
    this.expanded.update((value) => !value)
  }
  toggleVisible() {
    this.visible.update((value) => !value)
  }
}
