---
title: Angular Chart
description: Complete option and type reference for the @tanstack/charts/angular standalone component.
---

```ts
import { Chart } from '@tanstack/charts/angular'
```

`Chart` is a standalone component with selector `div[tanstack-chart]`, available
from Angular 20 onward. It accepts `ChartOptions` through the required signal
input `options`. Replace the definition identity when captured application
values change. The old `tanstack-chart` element selector has been removed;
see the [adapter comparison and migration](../comparison.md).
The definition also owns `focus`, `focusRing`, `cursor`, `tooltip`, `svgAnimation`,
`keyboard`, `maxFocusDistance`, and `spatialIndex`.

## Renderer entry points

```ts
import { Chart } from '@tanstack/charts/angular'
import { Chart as CanvasChart } from '@tanstack/charts/angular/canvas'
```

The default component uses `div[tanstack-chart]` and an SVG default renderer.
The optional Canvas component uses `div[tanstack-canvas-chart]` and
`canvasChartRenderer`. Both are standalone and accept required `options` signal
inputs; they can coexist in one Angular template.

The Canvas entry exports `Chart`, `ChartCommonOptions`, `ChartOptions`,
`ChartPresentationOptions`, `ChartTooltipBodyDirective`,
`ChartTooltipBodyRenderContext`, `ChartTooltipBodyTemplateContext`,
`ChartDefinition`, and `ChartPoint`. The tooltip directive is the same declaration
exported by the SVG entry.

Canvas `ChartOptions` has the common options below except `renderSvg`.
Its `onRender` and `rendered` payload is `ChartRendererRenderContext`, exposing
`surface`, `scene`, `container` and `interaction` without an `svg` property.
The component selects its renderer; there is no `renderer` option.
See [Canvas default](../adapter.md#canvas-default) for rendering and SSR behavior.

## Server rendering strategy

`CHART_SERVER_RENDER` is exported by the SVG and Canvas entries as the same
injection token. Its type is `ChartServerRenderStrategy`:

```ts
type ChartServerRenderStrategy = (render: () => void) => void
```

The shared host invokes the strategy during each chart's construction, in that
chart's injection context. The supplied callback reads the current inputs and
queries when invoked. A custom strategy must defer that read until the view is
ready and own its scheduling and cleanup in the chart's context. The default
strategy registers `effect(render)`, preserving existing SSR without extra setup.

`provideChartsServerRendering()` from `@tanstack/charts/angular/server` returns
application-level environment providers. It overrides the strategy with a
request-local queue and registers Angular's `BEFORE_APP_SERIALIZED` hook.
Live SVG and Canvas charts serialize from their final inputs once; charts
destroyed beforehand are removed. Duplicate provider registration does not
serialize the queue twice. Errors go to the application's `ErrorHandler`; a
throwing handler aborts the remaining batch, and the queue is still cleared.

The provider affects server scheduling only. Browser effects and mounting are
unchanged. The server entry requires the optional `@angular/platform-server`
peer, Angular 20 or later. See the [server setup](../adapter.md#render-once-before-server-serialization).

## `options`

| Option               | Type                                         | Default               | Meaning                                                             |
| -------------------- | -------------------------------------------- | --------------------- | ------------------------------------------------------------------- |
| `definition`         | `ChartDefinition`                            | Required              | Framework-neutral chart definition                                  |
| `ariaLabel`          | `string`                                     | Required              | Accessible chart name                                               |
| `ariaDescription`    | `string`                                     | None                  | Optional accessible description                                     |
| `height`             | `number`                                     | `320` without a ratio | Fixed CSS and scene height                                          |
| `aspectRatio`        | `number`                                     | None                  | Positive width-to-height ratio when height is absent                |
| `width`              | `number`                                     | Responsive            | Fixed CSS and scene width                                           |
| `initialWidth`       | `number`                                     | `640`                 | Initial and server width before responsive measurement              |
| `tabIndex`           | `number`                                     | `0`                   | Surface tab index; `keyboard: false` forces `-1`                    |
| `idPrefix`           | `string`                                     | Generated             | Prefix for renderer-owned document IDs                              |
| `renderSvg`          | `ChartSvgRenderer<TDatum, TXValue, TYValue>` | `renderChartSvg`      | Scene-to-SVG renderer                                               |
| `measureText`        | `ChartTextMeasurer`                          | Host measurer         | Guide text measurement                                              |
| `onFocusChange`      | `(point: ChartPoint \| null) => void`        | None                  | Primary focus callback                                              |
| `onFocusGroupChange` | `(points: readonly ChartPoint[]) => void`    | None                  | Grouped focus callback                                              |
| `onSelect`           | `(point: ChartPoint \| null) => void`        | None                  | Pointer or keyboard activation callback                             |
| `onRender`           | `(context: ChartRenderContext) => void`      | None                  | Default SVG, complete surface, container, and scene after rendering |
| `className`          | `string`                                     | None                  | Extra class on the rendered chart surface                           |

Callbacks remain functions inside `options`. Replace the complete `options`
value when chart state changes so `OnPush` change detection delivers a reactive
input update. Chart accessibility options apply to the rendered surface; native
`aria-label` and `tabindex` attributes on the outer host apply only to that host.

## Outputs

`Chart` exposes four optional Angular outputs alongside the callbacks:

| Output             | Payload                 | Callback counterpart         |
| ------------------ | ----------------------- | ---------------------------- |
| `rendered`         | `ChartRenderContext`    | `options.onRender`           |
| `focusChange`      | `ChartPoint \| null`    | `options.onFocusChange`      |
| `focusGroupChange` | `readonly ChartPoint[]` | `options.onFocusGroupChange` |
| `pointSelect`      | `ChartPoint \| null`    | `options.onSelect`           |

The Canvas component exposes the same four outputs, with the generic
`ChartRendererRenderContext` payload for `rendered`.

If both forms are registered, the callback runs first and the output emits the
same payload once. Value-producing callbacks such as `renderSvg` and tooltip
formatters remain functions.

## Tooltip body template

Project a typed tooltip template into the chart:

```html
<div tanstack-chart [options]="chartOptions">
  <ng-template [tanstackChartTooltipBody]="chartOptions.definition" let-tooltip>
    <ng-container [ngTemplateOutlet]="tooltip.defaultBody" />
    <series-detail [points]="tooltip.points" />
    @if (tooltip.pinned) {
    <button type="button" (click)="tooltip.dismiss()">Close</button>
    }
  </ng-template>
</div>
```

Import `ChartTooltipBodyDirective` and Angular's `NgTemplateOutlet` beside
`Chart`. The context exposes `primaryPoint`, `points`, `content`, `defaultBody`, `pinned`, and
`dismiss`; named template bindings are also available. Binding the same
definition gives Angular's strict template checker the datum and x/y value
types through `ngTemplateContextGuard`. The directive declares that definition
with `input.required()` and alias `tanstackChartTooltipBody`; the definition is
only used for type inference. Access `directive.definition()` when reading a
directive instance. Ordering, anchoring, placement, portaling, and pinning remain
in the chart definition. The same projection works inside
`<div tanstack-canvas-chart>`.

## Exported types

`ChartOptions` contains chart host options with `className` for the
rendered surface: the SVG root or the root `div` of mixed SVG/Canvas layers.
Host classes and styles use native Angular bindings. See
[Canvas marks](../adapter.md#canvas-marks) for per-mark Canvas rendering and
current renderer entry-point support.

`ChartCommonOptions` contains the same options without `definition`.
`ChartPresentationOptions` contains `className`; host `class` and `style` use
native Angular bindings.

The package also exports `ChartTooltipBodyDirective`,
`ChartTooltipBodyRenderContext`, and `ChartTooltipBodyTemplateContext`. It
re-exports `ChartDefinition` and `ChartPoint`.

See the [Angular adapter](../adapter.md) for lifecycle and SSR behavior,
[Focus and interaction](../../../reference/focus-and-interaction.md) for
callback semantics, and [Rendering and export](../../../reference/rendering-and-export.md)
for custom SVG renderers.
