---
title: Angular Adapter
description: Render TanStack Charts with an Angular standalone component.
---

```sh
pnpm add @tanstack/charts @angular/cdk @angular/common @angular/core @angular/platform-browser
```

```ts
import { Component, signal } from '@angular/core'
import { Chart } from '@tanstack/charts/angular'
import { defineChart } from '@tanstack/charts'
import { tooltip } from '@tanstack/charts/tooltip'

@Component({
  imports: [Chart],
  template: `<div tanstack-chart [options]="chartOptions()"></div>`,
})
export class RevenueChart {
  readonly chartOptions = signal({
    definition: defineChart(createRevenueChart(rows), { tooltip }),
    ariaLabel: 'Revenue by month',
    aspectRatio: 16 / 9,
  })
}
```

Angular 20 or newer is required. The single `options` signal input accepts a
plain immutable value or the result of an application signal. The standalone
component ships as a partial-Ivy Angular package, so consuming applications
link it with their own Angular compiler.

Definitions and marks come from `@tanstack/charts`; Angular-specific values
come from `@tanstack/charts/angular`. Keeping these entry points separate avoids
making every framework adapter re-export the complete authoring API while
preserving a single installable package.

## Lifecycle

An Angular `effect` creates or updates one shared adapter controller when the
`options` input signal or tooltip-body content query changes. Function-based
`viewChild` and `contentChild` queries replace query decorators.
`afterNextRender` mounts only on Angular's browser platform, and `DestroyRef`
cleans up the controller and CDK tooltip portal. Replace the complete `options`
value when chart state changes; mutating the existing object does not change the
input signal. Callbacks such as `onFocusChange` are functions inside `options`,
not Angular outputs.

The component keeps the renderer graph directly and uses a local
`injectChartTooltipBody` helper for tooltip state and portal reconciliation.
The returned `tooltipBody` controller is visible to the template, so nested
signals can be read directly without alias fields.

## Browser and server status

The Angular 20 example is compiled and tested with Angular CLI's native
`@angular/build:unit-test` Vitest builder. The verified contract covers complete
SVG server rendering through Angular's `renderApplication`, browser mount,
signal-driven immutable updates, production compilation, and teardown. Angular
hydration is not yet part of the adapter's tested public contract.

## Presentation and rendering

The component selector is `div[tanstack-chart]`, so the element carrying the
directive is also the chart host. Put classes and styles directly on that
element; Angular merges them with the static `ts-chart-host` class and sizing
styles. `options.class` and `options.style` are no longer Angular options.
`options.className` still applies to the rendered SVG surface. Use `renderSvg`
to replace SVG serialization without replacing the shared host.

Exports: `Chart`, `ChartCommonOptions`, `ChartOptions`,
`ChartTooltipBodyDirective`,
`ChartTooltipBodyRenderContext`, `ChartTooltipBodyTemplateContext`,
`ChartDefinition`, and `ChartPoint`.

## Tooltip body composition

Project an `ng-template` with
`[tanstackChartTooltipBody]="chartOptions.definition"` for Angular-owned
content. The definition binding is the generic type witness for strict template
checking; it does not configure behavior a second time. Render
`tooltip.defaultBody` through `NgTemplateOutlet` to retain native rows and
swatches. The shared host owns focus, placement, portaling, inert transient
state, pinning, and dismissal; Angular CDK owns the embedded-view portal
lifecycle.

See the [`Chart` reference](./reference/chart.md) and
[Chart Definition API](../../reference/chart-definitions.md). A complete
zoneless Angular 20 application and its native tests live in
[`examples/charts-angular`](https://github.com/TanStack/charts/tree/main/examples/charts-angular).

Maintainer-facing implementation rationale is recorded in
[`packages/angular-charts/ANGULAR_MODERNIZATION.md`](https://github.com/TanStack/charts/blob/main/packages/angular-charts/ANGULAR_MODERNIZATION.md).
