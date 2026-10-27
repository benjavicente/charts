---
title: Angular Adapter
description: Render TanStack Charts with a signal-first Angular component and native chart host.
---

Import `ChartComponent` from `@tanstack/charts/angular` and attach it to a native
`div`. It targets signal-based, zoneless applications. The same entry exports
the deprecated `Chart` component for existing `<tanstack-chart>` templates.

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { ChartComponent } from '@tanstack/charts/angular'
import type { ChartComponentOptions } from '@tanstack/charts/angular'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    <div
      tanstack-chart
      [options]="options()"
      id="revenue"
      class="revenue-chart"
      data-owner="revenue"
      [style.height.px]="height()"
    ></div>
  `,
})
export class RevenueChart {
  readonly height = signal(240)
  readonly options = signal<ChartComponentOptions>({
    definition, // A shared framework-neutral chart definition.
    ariaLabel: 'Revenue by month',
  })
}
```

Configure zoneless change detection in the application bootstrap when required
by the Angular version in use. The examples target Angular 20 and later. The existing Angular peer range remains
`>=19`, and the component explicitly declares standalone and `OnPush` behavior.
Configure `provideZonelessChangeDetection()` on Angular 20 and later, or
`provideExperimentalZonelessChangeDetection()` on Angular 19.

## Native host and options

The native `div` is the `.ts-chart-host`. Its ID, classes, data attributes and
Angular style bindings apply to the element that owns chart layout. Native
height bindings override the component's default height; omit `options.height`
and `aspectRatio` when CSS should control scene height. Explicit option
dimensions still control scene geometry.

Use immutable `options` updates. The input and template queries are signals;
pure computed values derive layout and renderer options. A lazy getter creates
one adapter at its first imperative use and registers disposal with its Angular
owner. One shared callback applies options on both platforms: a render effect
schedules it after native host bindings in the browser, and a component effect
schedules it on the server. A separate one-time render callback mounts the chart.
Server rendering serializes current options without mounting the browser runtime;
hydration adopts the server SVG and mark nodes.

The options follow the [Chart reference](./reference/chart.md). Use native
Angular class and style bindings on the host. `svgClass` applies to the rendered
root SVG. Callback signal reads and operations on the `onRender` interaction
controller run untracked, so a callback's incidental reads do not become
dependencies of a calling effect.

## Projected tooltip bodies

Import `ChartTooltipBodyDirective` from the same entry. Bind the definition to
`[tanstackChartTooltipBody]` for strict template inference:

```html
<div tanstack-chart [options]="options()">
  <ng-template [tanstackChartTooltipBody]="options().definition" let-tooltip>
    {{ tooltip.primaryPoint?.datum?.month }}
    <ng-container [ngTemplateOutlet]="tooltip.defaultBody" />
    <button (click)="tooltip.dismiss()">Dismiss</button>
  </ng-template>
</div>
```

Import `NgTemplateOutlet` to render the default body. Every context field,
including `primaryPoint`, follows the current tooltip target. Angular renders
projected content in a private component inside the core-owned tooltip body;
focus changes update that component's input and retain its embedded view.
Replacing the template replaces the view. Hiding the tooltip destroys the body
view, and reopening creates a fresh one, matching the React and Solid adapters.
The shared core owns placement, portaling, focus, pinning and dismissal.

Exports: `ChartComponent`, `ChartComponentOptions`, deprecated `Chart`,
`ChartCommonOptions`, `ChartOptions`, `ChartPresentationOptions`,
`ChartTooltipBodyDirective`, `ChartTooltipBodyRenderContext`,
`ChartTooltipBodyTemplateContext`, `ChartDefinition`, and `ChartPoint`.

## Migrating from Chart

Both components and `ChartTooltipBodyDirective` come from the same entry point.
Replace `Chart` with `ChartComponent` in the component imports and change the
host tag:

```html
<!-- Deprecated Chart -->
<tanstack-chart [options]="options()"></tanstack-chart>

<!-- ChartComponent -->
<div tanstack-chart [options]="options()"></div>
```

Keep chart configuration and projected tooltip templates. Use
`ChartComponentOptions` for the new component: move `options.class` and
`options.style` to native Angular host bindings, and rename `className` to
`svgClass`. `ChartComponent.options` is a signal when accessed through a
component instance; Angular's `[options]` binding stays the same. Host IDs, classes and styles now belong to the layout
owner, so CSS that targets the legacy outer/inner element structure must be
updated. `Chart` keeps that structure and its original behavior for compatibility.
The tooltip directive retains its value-shaped `definition` property and
`tanstackChartTooltipBody` binding as a generic type witness.

## Side-by-side example

Run `pnpm dev:charts-angular` from the repository root. The example uses the same
definitions and data in the deprecated and new component columns and the shared fixture stylesheet used by
the other adapters. Its rows demonstrate tooltip primary-point freshness,
callback tracking, native host identity and CSS sizing, and immutable updates
with unmount/remount controls. Run the example's `test` script for compiled
adapter regressions, then `build` and `test:browser` for the browser comparison.
