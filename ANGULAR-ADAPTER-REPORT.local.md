# Angular adapter modernization report

Updated October 28, 2026 for the implementation through `177cf0b7`.
This replaces the intermediate report that still described `ChartComponent`,
`svgClass`, a deprecated component, and Angular 19 compatibility.

## Current public API

The Angular adapter requires **Angular 20 or later**. The public SVG component
is `Chart`, imported from `@tanstack/charts/angular`, with selector
`div[tanstack-chart]`. The old `<tanstack-chart>` component was removed; it is
not shipped as a deprecated alternative. `ChartComponent` and
`ChartComponentOptions` are not public exports.

An optional `@tanstack/charts/angular/canvas` entry exports a Canvas-default
component, also named `Chart`, with selector `div[tanstack-canvas-chart]`.
Alias imports when using both. Compatibility-package imports are
`@tanstack/angular-charts`, `/canvas`, and `/server` respectively.

| Concern                   | Current behavior                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Options                   | `ChartOptions` for SVG; renderer-specific options from the Canvas entry                                       |
| Host styling              | Native Angular class and style bindings on the owning `div`                                                   |
| Surface styling           | `options.className` on the SVG or layered root; no `svgClass` input                                           |
| Accessibility             | `ariaLabel`, `ariaDescription`, and `tabIndex` configure the rendered surface                                 |
| Notifications             | Callbacks remain supported alongside `rendered`, `focusChange`, `focusGroupChange`, and `pointSelect` outputs |
| Value-producing callbacks | Renderers, formatters, and tooltip content remain functions                                                   |
| Tooltip definition        | Required signal input, aliased to `tanstackChartTooltipBody`, preserving generic context inference            |
| Server scheduling         | Default reactive effect; optional serialization-time provider                                                 |

The old component already accepted signal **values** through
`[options]="options()"`. It used a decorator input and `ngOnChanges` internally.
The new component uses `input.required()` and reactive derivation internally;
its instance input is read as `chart.options()`. Neither component accepts the
signal itself through `[options]="options"`.

When callback and output counterparts are both registered, the callback runs
first and the output receives the same payload once. Consumers should register
both only when both deliveries are intended.

## Correctness and lifecycle

The old tooltip could retain its first `primaryPoint` while updating the other
context fields. The new body derives the complete context from the current
target. Focus changes reuse the active view; replacing a template replaces its
view; hiding destroys it and reopening creates a fresh one.

Callbacks, output delivery, and exposed interaction operations run untracked.
Incidental consumer signal reads therefore do not become dependencies of an
invoking Angular effect. The example reproduces the original extra focus-effect
execution and verifies the new behavior.

The native host puts identity, classes, data attributes, and layout on one
`div`, resolving the old split between the custom element and inner layout
owner. Host bindings are applied before browser chart updates. Surface
accessibility remains separate from native host attributes.

Private `injectChartHost`, `injectChartRendererAdapter`, and
`injectChartTooltipBody` utilities share lifecycle and projection behavior
between the SVG and Canvas components. Renderer-specific inputs and event
payloads remain separate. The adapter is lazy, stable across ordinary updates,
and destroyed through its owning `DestroyRef`.

Tooltip creation uses `ViewContainerRef.createComponent()` with dynamic
`inputBinding()` for target and projected template. It needs no separate
synchronization effect or `ComponentRef.setInput()` bridge. Angular owns the
component and embedded view; the chart core owns the tooltip body destination.

Components use required signal inputs, signal queries, computed derivation,
explicit OnPush, and Angular's default standalone setting. Compiler-managed
queries remain protected because Angular rejects ECMAScript-private queries.
Shared imported host/template constants were checked with Angular 20 and 22;
the component metadata references these fields explicitly.

## Canvas and package boundaries

The SVG component still supports per-mark Canvas composition. The optional
Canvas entry additionally supplies a Canvas-default surface. Canvas SSR emits
an unpainted shell; it does not provide the visible server chart that SVG does.

The Angular Package Format can inline private shared helpers into secondary
entries. SVG and Canvas therefore have distinct private tooltip component IDs,
while sharing their template and input base. The public tooltip directive and
server strategy token retain identity through the primary entry. Packaging
finalizes sibling imports and removes redundant secondary proxy manifests.
Browser entries do not import `@angular/platform-server`.

## Server rendering and hydration

`CHART_SERVER_RENDER` is a public strategy token with an empty debug description.
Its default strategy registers `effect(render)` in the chart injection context,
preserving reactive SSR without extra setup.

`provideChartsServerRendering()` from `@tanstack/charts/angular/server` optionally
overrides that strategy. A queue owned by the application injector registers
live charts, and each chart's `DestroyRef` unregisters it. Angular's
`BEFORE_APP_SERIALIZED` hook flushes final inputs once after stability. Duplicate
provider registration does not render twice; applications have isolated queues.
Errors go to `ErrorHandler`, and the queue clears even if that handler throws.
`@angular/platform-server >=20` is an optional peer for this server entry.

Both strategies include final data, dimensions, and accessibility inputs.
Hydration adopts the existing server SVG, mark, and Canvas nodes. Subsequent
updates preserve mounted identity. Server rendering does not mount a browser
renderer or invoke its `onRender` notification.

## Performance evidence

The matched October 27 benchmark compares upstream `778f2cc6` with `6d417fbd`,
using the same Angular 22 and chart core. It predates the optional SSR strategy;
its numbers must not be presented as measurements of `177cf0b7`.

- SVG whole-app gzip size: 83.85 KiB old versus 88.50 KiB new, +4.64 KiB (5.54%).
- Browser mounting: 50–61% less time across the measured workloads.
- SVG data-update and SSR times: close to the old adapter's measurements.
- Canvas reduces DOM/output size and some update costs; its SSR shell is unpainted.

Chrome profiles attributed less than 0.5% of sampled active CPU to the Angular
wrapper. Dense Canvas positional projection and SVG reconciliation dominate
larger costs. Shared-core projection work remains a separate task in `PLAN.md`.
The optional SSR provider has correctness/count coverage, not a newly measured
latency or bundle-size result.

See [the public performance report](docs/framework/angular/performance.md),
[raw benchmark samples](benchmarks/comparison/angular-adapters/2026-10-27.json),
and [profile summaries](benchmarks/comparison/angular-adapters/2026-10-28-profile.json).
The size report retains earlier intermediate measurements as historical evidence.

## Verification performed

- Nineteen compiled Angular 22 tests pass, including default and queued SSR,
  late inputs for SVG and Canvas, destroyed charts, and sequential/concurrent
  application isolation.
- Production prerendering and Chromium checks pass for exact SVG/mark/Canvas
  hydration node reuse, tooltip lifecycle, callback/output identity, untracked
  focus, native host and surface styling, updates, renderer switching, cleanup,
  themes, and mobile layout.
- All seven framework adapter package gates pass. Emitted Angular entries share
  the directive and token, avoid duplicate component IDs, and exercise queued
  cleanup, duplicate providers, and both throwing/nonthrowing error handlers.
- Angular 20.0.0 links and runs the emitted SVG/Canvas/server entries with both
  default and queued SSR. Earlier strict Angular 20 consumer/template checks
  also preserve Canvas tooltip inference; the latest strategy harness is a
  runtime/linker check rather than a new strict consumer compilation.
- Repository typecheck, four unified-package artifact tests, public callback
  inventory (817 callable surfaces), docs contracts/synchronization, formatting,
  and whitespace checks pass. Full repository CI was not run.

The adapter targets zoneless applications; Zone.js support was not added.
Angular 19 is outside the new peer range because dynamic `inputBinding()`
requires Angular 20. Package version numbers remain unchanged until release;
the changeset records this as a major API change.
