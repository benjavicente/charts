---
title: Angular Adapter
description: Render TanStack Charts with a signal-first Angular component and native chart host.
---

Import `Chart` from `@tanstack/charts/angular` and attach it to a native
`div`. It targets signal-based, zoneless applications. This replaces the old
`<tanstack-chart>` component; see the [adapter comparison and migration](./comparison.md).

```ts
import { ChangeDetectionStrategy, Component, signal } from '@angular/core'
import { Chart } from '@tanstack/charts/angular'
import type { ChartOptions } from '@tanstack/charts/angular'

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart],
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
  readonly options = signal<ChartOptions>({
    definition, // A shared framework-neutral chart definition.
    ariaLabel: 'Revenue by month',
  })
}
```

The Angular entry requires Angular 20 or later. It uses dynamic input bindings
for tooltip views and declares `OnPush` behavior. Components and directives are
standalone by default, so their metadata omits `standalone: true`.
On Angular 20, configure zoneless change detection with
`provideZonelessChangeDetection()` at bootstrap. Zoneless change detection is
the default from Angular 21. The repository example uses Angular 22.

## Native host and options

The native `div` is the `.ts-chart-host`. Its ID, classes, data attributes and
Angular style bindings apply to the element that owns chart layout. Native
height bindings override the component's default height; omit `options.height`
and `aspectRatio` when CSS should control scene height. Explicit option
dimensions still control scene geometry.

The host owns layout, while the rendered surface owns chart accessibility and
keyboard focus. Set `options.ariaLabel`, `options.ariaDescription`, and
`options.tabIndex` for that surface. Native `aria-label` or `tabindex` attributes
on the outer `div` do not forward to the chart surface.

Use immutable `options` updates. The input and template queries are signals;
pure computed values derive layout and renderer options. A lazy getter creates
one adapter at its first imperative use and registers disposal with its Angular
owner. One shared callback applies options on both platforms: a render effect
schedules it after native host bindings in the browser, and a component effect
schedules it on the server. A separate one-time render callback mounts the chart.
Server rendering serializes current options without mounting the browser runtime;
hydration adopts the server SVG and mark nodes.

The options follow the [Chart reference](./reference/chart.md). Use native
Angular class and style bindings on the host. `className` applies to the renderer-owned
surface: the SVG root for an SVG chart, or the layered root `div` for mixed
SVG/Canvas marks. It does not style the internal mount container or each layer.
Callback signal reads and operations on the `onRender` interaction
controller run untracked, so a callback's incidental reads do not become
dependencies of a calling effect.

## Canvas marks

`Chart` supports Canvas marks through the shared renderer composition. Import
`canvasChartRenderer` from `@tanstack/charts/canvas` and assign it to the marks
that should use Canvas:

```ts
import { dot } from '@tanstack/charts'
import { canvasChartRenderer } from '@tanstack/charts/canvas'

const points = dot(data, {
  x: 'x',
  y: 'y',
  renderer: canvasChartRenderer,
})
```

Include that mark in your existing definition's `marks` array. The component
still uses SVG as the default renderer for other marks and guides. The core
composes the SVG and Canvas layers, owns interaction, and prerenders a Canvas
shell on the server; the browser paints its pixels after mounting.

Angular currently exposes the SVG-default component, without dedicated
`/angular/canvas` or `/angular/core` entries. React and Octane additionally
offer those renderer entry points for a full Canvas default or an
application-supplied renderer. The other web adapters, including Angular,
support Canvas through per-mark composition. `renderSvg` only replaces SVG
serialization; it is not a replacement for a `ChartRenderer` option.

## Events and callbacks

`Chart` also exposes `rendered`, `focusChange`, `focusGroupChange`, and
`pointSelect` outputs. These are optional event subscriptions; the corresponding
`options.onRender`, `options.onFocusChange`, `options.onFocusGroupChange`, and
`options.onSelect` functions remain supported. When both forms are configured,
the callback runs first and the output emits the same payload once.

```html
<div
  tanstack-chart
  [options]="options()"
  (focusChange)="onFocusChange($event)"
  (pointSelect)="onPointSelect($event)"
></div>
```

Only these four notification callbacks have output counterparts. Functions that
provide values or behavior, including `renderSvg` and definition formatting
callbacks, remain functions.

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
dynamic input bindings follow the current target and projected template without
a separate synchronization effect. Focus changes retain the embedded view.
Replacing the template replaces the view. Hiding the tooltip destroys the body
view, and reopening creates a fresh one, matching the React and Solid adapters.
The shared core owns placement, portaling, focus, pinning and dismissal.

Exports: `Chart`, `ChartOptions`, `ChartCommonOptions`, `ChartPresentationOptions`,
`ChartTooltipBodyDirective`, `ChartTooltipBodyRenderContext`,
`ChartTooltipBodyTemplateContext`, `ChartDefinition`, and `ChartPoint`.

## Migrating from the old adapter

Keep the `Chart` import and change `<tanstack-chart>` to
`<div tanstack-chart>`. `ChartOptions` now describes the native-host component:
move `class` and `style` onto the host and keep `className` for the rendered surface.
`Chart.options` and `ChartTooltipBodyDirective.definition` are now read-only
input signals when accessed through an instance; template bindings keep their
names. See the [full comparison](./comparison.md) for before/after examples.

## Side-by-side example

Run `pnpm dev:charts-angular` from the repository root. The example uses the same
definitions and data in a historical adapter snapshot and the current `Chart`,
with the shared fixture stylesheet used by the other adapters. The historical
implementation lives only in the example; it is not a package export. Its rows demonstrate tooltip primary-point freshness,
callback tracking, native host identity and CSS sizing, and immutable updates
with unmount/remount controls. Run the example's `test` script for compiled
adapter regressions, then `build` and `test:browser` for the browser comparison.
The production build prerenders the page in Node. The browser check pauses
bootstrap to capture the server SVG and mark nodes, then verifies that hydration
and immutable updates retain those exact nodes.
