# `@tanstack/angular-charts`

This compatibility package remains supported for existing applications. New
applications use the Angular standalone component from
`@tanstack/charts/angular`.

```sh
pnpm add @tanstack/charts @angular/cdk @angular/core @angular/platform-browser
```

```ts
import { defineChart } from '@tanstack/charts'
import { tooltip } from '@tanstack/charts/tooltip'
import { Chart } from '@tanstack/charts/angular'

@Component({
  imports: [Chart],
  template: `<tanstack-chart [options]="chartOptions" />`,
})
export class RevenueChart {
  chartOptions = {
    definition: defineChart(definition, { tooltip }),
    ariaLabel: 'Revenue by month',
  }
}
```

Angular 20 or newer is required. The component uses function-based signal
inputs and queries, Angular CDK portals for projected tooltip bodies,
`DestroyRef` cleanup, and browser-only `afterNextRender` mounting. Bind one
typed immutable `options` value, including a value read from an application
signal. Definitions and marks stay on `@tanstack/charts`; the Angular component
and adapter-only types stay on `@tanstack/charts/angular`.

See the complete zoneless Angular 20 application in
[`examples/charts-angular`](https://github.com/TanStack/charts/tree/main/examples/charts-angular).

Read the published
[Angular adapter guide](https://tanstack.com/charts/latest/docs/framework/angular/adapter)
and
[`Chart` reference](https://tanstack.com/charts/latest/docs/framework/angular/reference/chart).
