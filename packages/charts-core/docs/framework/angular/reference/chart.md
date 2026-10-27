---
title: Angular Chart
description: Complete option and type reference for the @tanstack/charts/angular standalone component.
---

```ts
import { ChartComponent } from '@tanstack/charts/angular'
```

`ChartComponent` is a standalone component with selector `div[tanstack-chart]`.
The deprecated `Chart` retains selector `tanstack-chart`. Both are exported from
the same entry. `ChartComponent` accepts `ChartComponentOptions`; the deprecated
component retains `ChartOptions`. The required
`options` input accepts a chart definition. Replace the definition identity
when captured application values change.
The definition also owns `focus`, `focusRing`, `cursor`, `tooltip`, `svgAnimation`,
`keyboard`, `maxFocusDistance`, and `spatialIndex`.

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
| `svgClass`           | `string`                                     | None                  | Extra class on the rendered root SVG                                |

Callbacks are functions inside `options`, not Angular outputs. Replace the
complete `options` value when chart state changes so `OnPush` change detection
delivers a reactive input update.

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
`ChartComponent`. The context exposes `primaryPoint`, `points`, `content`, `defaultBody`, `pinned`, and
`dismiss`; named template bindings are also available. Binding the same
definition gives Angular's strict template checker the datum and x/y value
types. Ordering, anchoring, placement, portaling, and pinning remain in the
definition.

## Exported types

`ChartComponentOptions` contains chart host options with `svgClass` for the
root SVG. Host classes and styles use native Angular bindings.

The deprecated `Chart` retains `ChartCommonOptions`, `ChartOptions`, and
`ChartPresentationOptions`, including `class` and the string `style` for its
inner host, and `className` for its SVG surface.

The package also exports `ChartTooltipBodyDirective`,
`ChartTooltipBodyRenderContext`, and `ChartTooltipBodyTemplateContext`. It
re-exports `ChartDefinition` and `ChartPoint`.

See the [Angular adapter](../adapter.md) for lifecycle and SSR behavior,
[Focus and interaction](../../../reference/focus-and-interaction.md) for
callback semantics, and [Rendering and export](../../../reference/rendering-and-export.md)
for custom SVG renderers.
