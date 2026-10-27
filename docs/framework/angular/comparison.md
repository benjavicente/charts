---
title: Angular Adapter Comparison and Migration
description: Compare the old Angular adapter with the native-host, signal-based Chart and migrate existing templates and options.
---

The Angular 20 adapter replaces the old `Chart` implementation. The public
component and options are still named `Chart` and `ChartOptions`, imported from
`@tanstack/charts/angular`. The old element selector is removed in this major
release. The SVG entry exports `Chart`; an optional `/angular/canvas` entry
exports a Canvas-default `Chart` with the same Angular host integration.

## What changes

| Concern                  | Old adapter                                                                                    | New adapter                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Angular minimum          | 19                                                                                             | 20, for dynamic `inputBinding()`                                                                                     |
| Component import         | `Chart`                                                                                        | `Chart`                                                                                                              |
| Template                 | `<tanstack-chart [options]="options()">`                                                       | `<div tanstack-chart [options]="options()">`                                                                         |
| Host identity            | ID, classes and data attributes belong to the outer custom element; an inner `div` owns layout | One native `div` owns identity and layout                                                                            |
| Host presentation        | `options.class` and string `options.style` style the inner host                                | Native `class`, `[class]`, `style` and `[style.*]` bindings style the host                                           |
| Surface class            | `options.className`                                                                            | `options.className`, on the SVG root or mixed-renderer root `div`                                                    |
| Component instance input | `chart.options` is a value                                                                     | `chart.options()` reads an input signal                                                                              |
| Reactive updates         | `ngOnChanges` applies immutable option replacements                                            | Computed values derive options; a render effect applies browser updates after host bindings                          |
| Notifications            | Four callbacks inside `options`                                                                | The callbacks plus optional `rendered`, `focusChange`, `focusGroupChange` and `pointSelect` outputs                  |
| Callback dependencies    | A synchronous controller operation can track signal reads inside callbacks                     | Callbacks, output delivery and exposed controller operations run untracked                                           |
| Tooltip context          | Reused contexts update most fields but retain the first `primaryPoint`                         | Every context field follows the current target while retaining the active view                                       |
| Tooltip projection       | Manual embedded-view creation, context mutation and change detection                           | A private Angular component receives target and template through `inputBinding()`                                    |
| Tooltip definition input | Decorated value property `directive.definition`                                                | Signal input `directive.definition()` with the same template binding alias                                           |
| Lifecycle                | Component hooks own adapter and tooltip cleanup                                                | Injection-context helpers and `DestroyRef` own cleanup                                                               |
| Server updates           | Initial serialization is saved when the adapter is created                                     | A server effect serializes the latest options before application stability                                           |
| Hydration                | The shared renderer can adopt server SVG                                                       | The renderer still adopts server SVG; the example verifies exact SVG and mark identity through hydration and updates |

Both adapters use the same framework-neutral chart definitions, renderers,
responsive layout and interaction core. The new adapter targets zoneless apps;
configure `provideZonelessChangeDetection()` on Angular 20. Angular 21 and later
use zoneless change detection by default. Components and directives rely on
[Angular's standalone default](https://angular.dev/api/core/Directive#standalone); `OnPush` remains explicit.

The optional [Canvas-default component](./adapter.md#canvas-default) adds
`div[tanstack-canvas-chart]`. SVG and Canvas components share private injection
utilities for host lifecycle and tooltip projection, while keeping their
renderer-specific input and event types. The existing per-mark Canvas
composition remains supported in the SVG component.

## Before and after

Keep the `Chart` import in your component's `imports` array. The options type
keeps its name, but its presentation fields change.

The snippets use a `RevenueDatum` with a string `id` and a `selectedId` signal
owned by the application. The chart definition and data stay unchanged.

Before:

```ts
import { signal } from '@angular/core'
import { Chart } from '@tanstack/charts/angular'
import type { ChartOptions } from '@tanstack/charts/angular'

const options = signal<ChartOptions<RevenueDatum, number, number>>({
  definition,
  ariaLabel: 'Revenue by month',
  class: 'revenue-chart',
  style: 'height: 240px',
  className: 'revenue-surface',
  onFocusChange: (point) => selectedId.set(point?.datum?.id ?? null),
})
```

```html
<tanstack-chart id="revenue" [options]="options()"></tanstack-chart>
```

After:

```ts
import { signal } from '@angular/core'
import { Chart } from '@tanstack/charts/angular'
import type { ChartOptions } from '@tanstack/charts/angular'

const options = signal<ChartOptions<RevenueDatum, number, number>>({
  definition,
  ariaLabel: 'Revenue by month',
  className: 'revenue-surface',
  onFocusChange: (point) => selectedId.set(point?.datum?.id ?? null),
})
```

```html
<div
  tanstack-chart
  id="revenue"
  class="revenue-chart"
  [style.height.px]="240"
  [options]="options()"
></div>
```

Use your definition's inferred datum type or the existing explicit
`ChartOptions<Datum, XValue, YValue>` in both versions. Update CSS selectors
that depended on the old outer element and inner `.ts-chart-host`: the native
`div` is now `.ts-chart-host`. If CSS owns height, omit `options.height` and
`aspectRatio`; explicit dimensions still control chart geometry.

Chart accessibility belongs to the rendered surface. Keep `ariaLabel`,
`ariaDescription` and `tabIndex` inside `options`. An `aria-label` or `tabindex`
on the native host applies to that host only.

## Callbacks and outputs

Existing callbacks continue to work. You may instead subscribe in the template:

```html
<div
  tanstack-chart
  [options]="options()"
  (focusChange)="selectedId.set($event?.datum?.id ?? null)"
></div>
```

When a callback and its output counterpart are both registered, the callback
runs first and the output receives the same payload once. Register your
application handler in one form unless you intend to handle the event twice.
Callbacks that supply values or behavior, including renderers, formatters and
tooltip content functions, remain functions. See the
[Chart reference](./reference/chart.md#outputs) for output names and payloads.

## Typed tooltip templates

The projected template binding is unchanged:

```html
<div tanstack-chart [options]="options()">
  <ng-template [tanstackChartTooltipBody]="options().definition" let-tooltip>
    {{ tooltip.primaryPoint?.datum?.month }}
    <button type="button" (click)="tooltip.dismiss()">Dismiss</button>
  </ng-template>
</div>
```

Continue importing `ChartTooltipBodyDirective`. Angular checks this template
separately from the chart component: the definition binding supplies its datum
and coordinate types, and
[`ngTemplateContextGuard`](https://angular.dev/guide/directives/structural-directives#typing-the-directives-context)
supplies the context shape.
The binding is still required for inference even though tooltip rendering
does not read the definition at runtime. Its declaration now uses
`input.required()` instead of `@Input`; code holding a directive instance reads
`directive.definition()`.

Focus changes reuse the active Angular view. Replacing the template replaces
that view; hiding destroys it and reopening creates a new one. Nested Angular
components keep their normal change detection and destruction lifecycle, even
when the core portals the tooltip outside the chart host.

## Run the comparison

Run `pnpm dev:charts-angular` to inspect both implementations with shared data
and controls. The old implementation is an example-only `LegacyChart` snapshot;
it is absent from the package exports. The four rows demonstrate:

- January to February focus: the old primary point stays January while the new
  context follows February.
- Logging preferences: changing a callback's incidental signal read reruns the
  old focus effect; the new effect keeps its original dependency set.
- Host styling: the new host's ID, class and data attribute match one compound
  selector, and its native height binding controls layout.
- Immutable data and dimension updates, unmount and remount: both receive the
  same chart definitions, and the new adapter preserves its mounted lifetime
  until destruction. The Canvas toggle renders the dots on Canvas while keeping
  the line and guides in SVG, then exercises cleanup and renderer changes.

The compiled tests cover outputs, tooltip updates and cleanup, native bindings,
and SVG/Canvas server serialization. The browser comparison also checks painted
Canvas pixels, surface class ownership, switching renderers and unmount cleanup.
The production example prerenders in Node; its browser check pauses bootstrap,
captures server SVG and mark nodes, and verifies that hydration and subsequent
updates retain those exact nodes.

The fifth example uses the Canvas-default component with no SVG surface. It
checks Canvas shell hydration, callback/output payload identity, untracked
focus operations, immutable updates, typed tooltip projection and cleanup.
