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

### Render once before server serialization

SSR uses an effect by default and needs no chart-specific application provider.
For applications that update chart inputs while server tasks are pending, the
optional server entry can defer chart rendering until the final HTML is serialized:

```ts
// Add to the application's existing server-only providers.
import { provideChartsServerRendering } from '@tanstack/charts/angular/server'

export const serverConfig = {
  providers: [provideChartsServerRendering()],
}
```

Keep the existing Angular SSR providers in the application's merged server
configuration. This chart provider belongs to the application injector; it is
not a component provider. The compatibility import is
`@tanstack/angular-charts/server`.

The provider overrides `CHART_SERVER_RENDER` for both SVG and Canvas charts.
Each live chart reads its latest inputs in Angular's `BEFORE_APP_SERIALIZED`
hook. Destroying a chart unregisters it. The browser lifecycle and chart
templates stay the same, and browser entries do not import
`@angular/platform-server`. See the [server strategy reference](./reference/chart.md#server-rendering-strategy).

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

## Canvas default

Import the optional Canvas component when both marks and guides should use
Canvas by default:

```ts
import { Chart as CanvasChart } from '@tanstack/charts/angular/canvas'
import type { ChartOptions as CanvasChartOptions } from '@tanstack/charts/angular/canvas'
```

```html
<div
  tanstack-canvas-chart
  class="revenue-chart"
  [style.height.px]="240"
  [options]="options()"
  (rendered)="onRendered($event)"
></div>
```

Add `CanvasChart` to the consuming component's `imports`. It uses the same chart
definitions, native host styling, accessibility options, focus outputs and
projected tooltip directive. Its `onRender` callback and `rendered` output
receive `ChartRendererRenderContext`, with `surface`, `scene`, `container` and
`interaction`; there is no promised `svg` field. The Canvas options omit
`renderSvg` and select `canvasChartRenderer` internally.

The distinct `div[tanstack-canvas-chart]` selector lets SVG and Canvas components
coexist in the same template. Both use private `injectChartHost` and
`injectChartTooltipBody` utilities for the same scheduling, resource ownership,
notification boundaries and Angular tooltip lifecycle. Signal inputs, outputs
and queries remain declarations on each component.

The default Angular entry has no Canvas runtime import. The `/canvas` entry
selects the optional renderer and re-exports the shared tooltip directive and
types. There is no separate renderer-neutral Angular component or `/angular/core`
entry. `renderSvg` on the SVG component replaces only SVG serialization.

Canvas SSR emits an accessible shell rather than pixel data. Hydration retains
its root and canvas elements, and the browser paints after mounting.

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
with unmount/remount controls. A separate Canvas-default example verifies
Canvas-only hydration, events and projected Angular tooltips. Run the example's `test` script for compiled
adapter regressions, then `build` and `test:browser` for the browser comparison.
The production build prerenders the page in Node. The browser check pauses
bootstrap to capture the server SVG and mark nodes, then verifies that hydration
and immutable updates retain those exact nodes.
