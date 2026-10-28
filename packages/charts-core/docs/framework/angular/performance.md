---
title: Angular Adapter Performance Comparison
description: Reproduce matched production measurements of the old and current Angular adapters, covering bundle size, server rendering, mounting, data updates and Canvas.
---

The native-host, signal-based adapter substantially reduces browser mounting
work. Its SVG data-update and server-rendering times are close to the old
adapter's, while its production bundle is larger. Both use the same chart
rendering pipeline.

These are local measurements from October 27, 2026, rather than performance
guarantees. The old adapter is the exact `Chart.ts`, `ChartTooltipBody.ts` and
`types.ts` from upstream `778f2cc6`. The current adapter is `6d417fbd`. Both
compile against the same current chart core and Angular dependencies, isolating
the adapter change from framework and renderer upgrades. These measurements
predate the optional SSR strategy added in `177cf0b7`; its latency and bundle
size have not been remeasured. The reproduction scripts use the current checkout,
so reruns after that commit are a new result rather than an exact reproduction
of the historical snapshot.

## Production JavaScript

Each adapter has its own isolated, optimized Angular CLI AOT application.
The applications use the same line-and-dot chart and benchmark harness.
Values include Angular, the chart, D3's linear scale and the harness; they are
whole application sizes, not the standalone adapter's size. No Canvas code
is imported into either SVG application.

| Application            |   Minified |      Gzip |    Brotli |
| ---------------------- | ---------: | --------: | --------: |
| Empty Angular harness  | 101.53 KiB | 33.85 KiB | 30.54 KiB |
| Old SVG adapter        | 243.95 KiB | 83.85 KiB | 74.35 KiB |
| Current SVG adapter    | 258.03 KiB | 88.50 KiB | 78.00 KiB |
| Current Canvas adapter | 263.96 KiB | 89.61 KiB | 78.67 KiB |

The current SVG app adds **4,755 bytes gzip: 4.64 KiB, or 5.54%**. This includes
the Angular runtime code retained by the new APIs. Compression and tree shaking
operate across the whole application, so subtracting the empty app does not
produce a separately transferable adapter bundle. Sizes exclude source maps
and license notices; gzip uses level 9 and Brotli uses quality 11.

## Matched SVG timings

All times are milliseconds. Tables report medians; the raw result includes
individual samples and p95 values. Each chart has a line, one dot per data row,
axes, grid lines, stable keys and explicit 720 × 320 dimensions. There is no
animation, tooltip or projected content in this timing fixture.

| Workload               | SSR old | SSR current | Mount old | Mount current | Update old | Update current |
| ---------------------- | ------: | ----------: | --------: | ------------: | ---------: | -------------: |
| 100 points             |    5.85 |        5.85 |      2.40 |          1.20 |       1.00 |           1.10 |
| 1,000 points           |   18.55 |       18.46 |     13.30 |          5.45 |       7.10 |           7.10 |
| 10,000 points          |  122.76 |      120.73 |    135.65 |         53.40 |      74.40 |          73.60 |
| 20 charts × 100 points |   39.41 |       39.11 |     35.95 |         16.45 |      19.00 |          18.75 |

Mounting takes 50–61% less time in these workloads. SVG updates and SSR are effectively unchanged. Unmounting is also similar: about 0.2 ms for one 1,000-point chart and 1.6 ms for 10,000 points in both adapters.

Mounting measures conditional creation of the chart component through its
first render and forced layout. The Angular application is already bootstrapped;
this is not navigation, network, initial JavaScript parsing or hydration time.
The old adapter creates serialized SVG and parses it into the DOM before
mounting the browser renderer. The current adapter goes directly to browser
mounting, avoiding that serialization and parsing step.

An update replaces options with a different immutable definition and commits
changed geometry. Both adapters keep their SVG and line nodes. Definitions
and rows are prepared outside the browser timing boundary. Synchronous timings
use `ApplicationRef.tick()` and force layout after each operation, comparing
adapter and renderer work independently of Angular's scheduler.

SSR measures the full `renderApplication()` request, including application
bootstrap, chart/data creation, serialization and platform teardown. Each
request gets a new application. The current server effect also handles late
option changes correctly; this fixture uses immediately available data and
does not time that additional behavior.

## Scheduled updates and frames

The runner also measures normal zoneless updates without manually ticking
Angular. It starts a changed-data update just after a frame and waits for every
chart's `onRender`, then crosses one and two animation-frame boundaries.
These are commit and frame-settling proxies, not GPU presentation timestamps.

Values below are **old → current**, in milliseconds.

| Workload               | Scheduled commit | Next-frame proxy | Two-frame proxy |
| ---------------------- | ---------------: | ---------------: | --------------: |
| 100 points             |      5.70 → 5.70 |    16.65 → 16.70 |   33.25 → 33.30 |
| 1,000 points           |    12.75 → 11.90 |    16.70 → 16.70 |   33.30 → 33.30 |
| 10,000 points          |    66.30 → 64.65 |    66.35 → 64.70 |   79.60 → 77.45 |
| 20 charts × 100 points |    22.20 → 22.30 |    22.20 → 22.30 |   33.30 → 33.35 |

The small and medium charts reach the same frame boundaries. The 10,000-point raw line-plus-dot workload exceeds a 16.7 ms frame in both SVG adapters. The adapter migration alone does not make that workload suitable for 60 fps updates.

## Canvas and output size

Canvas is an additional current-adapter capability, not an old-versus-new
Angular comparison. It receives the same raw rows and marks without sampling.
It retains far fewer DOM elements, but scene preparation and interaction-point
work still depend on the number of data rows.

| Workload               | SVG mount | Canvas mount | SVG update | Canvas update | SVG SSR | Canvas SSR | DOM elements, SVG / Canvas |
| ---------------------- | --------: | -----------: | ---------: | ------------: | ------: | ---------: | -------------------------: |
| 100 points             |      1.20 |         1.70 |       1.10 |          0.90 |    5.85 |       4.21 |                   147 / 15 |
| 1,000 points           |      5.45 |         5.50 |       7.10 |          4.60 |   18.46 |       9.39 |                  1047 / 15 |
| 10,000 points          |     53.40 |        64.95 |      73.60 |         64.75 |  120.73 |      54.83 |                 10047 / 15 |
| 20 charts × 100 points |     16.45 |        29.80 |      18.75 |         14.30 |   39.11 |      19.94 |                 2826 / 186 |

DOM counts cover the entire benchmark document. Canvas is not faster for every operation: SVG mounts faster than Canvas in these fixtures, while Canvas reduces data-update work. At 10,000 points even Canvas updates take roughly 65 ms; switching the renderer does not remove the shared scene and point-preparation cost.

For one 10,000-row chart, the old and current SVG documents contain 1,183,000
and 1,182,978 bytes respectively, or 145,804 and 145,787 bytes gzip. The current
Canvas document is 1,482 bytes, or 438 bytes gzip, at every tested row count.
**The Canvas document contains an unpainted shell.** Its chart appears only
after the client paints it; SVG already contains the visible server chart.
The smaller Canvas HTML and faster SSR therefore provide different output.
These HTML measurements do not include application scripts or a separate
serialized dataset.

Unmounting removes chart nodes in every tested cycle. This verifies DOM cleanup,
not retained-heap or long-duration leak behavior. Canvas painting is checked
by reading nontransparent pixels from the actual browser surface.

## Reproduce

From the repository root:

```sh
pnpm --filter @charts-internal/angular-example benchmark
```

The command builds four separate production apps, runs Node SSR and launches
Playwright Chromium. It writes build logs,
bundles, environment metadata and samples under
`examples/charts-angular/.benchmark-output/angular-adapters/`.

Pass `--skip-build --browser-only` or `--skip-build --ssr-only` when rerunning
against unchanged builds. `--build-only` builds and measures size. The pinned
baseline commit must be available in the local Git repository.

Environment: Apple M1, macOS Darwin 25.4.0, Node 24.17.0, Angular 22.0.8,
Angular CLI 22.2.2; Chromium's version is recorded in the result. This does not
benchmark Angular 20 or other browsers/devices. The viewport is 1280 × 800 at
device scale 1, with no CPU or network throttling. The active variant is brought
to the foreground. Variant order alternates across rounds.

Each SSR cell has five warm-ups and 40 measured requests, with explicit GC
outside the timing boundary. Each browser cell has five rounds, each with
three warm-up and 12 measured mount/unmount cycles, four data updates per
cycle, and two warm-up and 10 measured scheduled updates. That produces
60 mount/unmount, 240 synchronous-update and 50 scheduled-update samples per
adapter and workload. Every timed synchronous update must render exactly once
per chart, change point geometry and retain root and mark nodes. Scheduled
waits have a bounded timeout. Browser page errors fail the run.

The checked-in snapshot is `benchmarks/comparison/angular-adapters/2026-10-27.json`. It includes all final-run samples, p95 values, environment and generated-source hashes, plus the initial browser pass summaries. Both browser passes show the same large mounting improvement and closely matched SVG data-update costs.

This is a local development machine rather than an isolated performance lab.
Small differences, especially fractions of a millisecond and frame-quantized
values, should be treated as noise. The results do not measure network transfer,
hydration duration, tooltip interactions, outputs with listeners, responsive
resizing, animation, browser data preparation or heap retention. Those require
separate workloads before drawing performance conclusions.

## Optimization review and Chrome profiles

An independent Sol source review and targeted Chrome profiling on October 28
identified useful opportunities. The profiles below were collected before the optional SSR provider was
implemented; shared-core optimizations remain follow-up work. The Angular wrapper accounted for less than 0.5% of sampled active
CPU in these runs; short functions can fall between samples. Optimizing its
options spreads or output wrappers is unlikely to address dense-chart costs.

### 1. Skip unchanged server markup after callback-only updates

This is the clearest adapter-only opportunity. The server effect in
`packages/angular-charts/src/inject-chart-host.ts` observes the entire adapted
options object and always calls `prerender()` and writes `innerHTML`. A callback
change therefore repeats scene creation, serialization and parsing even when
the markup is unchanged.

The pending-task probe uses 10,000 rows and a counted wrapper around the default
SVG renderer. Each scenario has the same asynchronous task and 20 measured
requests after three warm-ups:

| Late server change           | Serializations | Median request |
| ---------------------------- | -------------: | -------------: |
| None                         |              1 |      183.98 ms |
| Replace only `onFocusChange` |              2 |      338.89 ms |
| Replace the data definition  |              2 |      334.47 ms |

The callback-only SVG was exactly identical to the baseline; the data-change
SVG differed. These probe times are not directly comparable with the earlier
benchmark, which did not include the asynchronous task and counted renderer.

**Implemented follow-up:** `CHART_SERVER_RENDER` defaults to a reactive effect.
Applications can opt into `provideChartsServerRendering()` from
`@tanstack/charts/angular/server` to render once through Angular's
[`BEFORE_APP_SERIALIZED`](https://angular.dev/api/platform-server/BEFORE_APP_SERIALIZED)
hook. The application owns the queue, chart destruction unregisters callbacks,
and the hook reads final inputs after stability. Browser entries remain free
of platform-server imports.

Nineteen compiled Angular tests, emitted-entry lifecycle checks, Angular 20/22
runtime checks, and production SVG/Canvas hydration checks pass. Callback-only
and late-data scenarios serialize once with the provider. The default effect
retains its reactive behavior and requires no extra server setup. See the
[server strategy reference](./reference/chart.md#server-rendering-strategy).

This follow-up is validated for behavior and serialization counts. The request
times above measure the earlier default effect, not the optional provider; no
new latency or size result is claimed. The `profile:ssr` runner intentionally
uses the default strategy to keep exposing that baseline behavior.

### 2. Reduce shared positional projection allocations

This is recorded as a separate shared-core follow-up in `PLAN.md`; it is outside
the Angular adapter's implementation scope.

In the 10,000-row Canvas trace, approximately **47% of sampled active CPU** was
attributed to `packages/charts-core/src/resolved-layout-position.ts`. Its
`projectLayoutAxis()` builds a temporary array and spreads a row object for each
valid point, separately for each axis. The line-plus-dot fixture produces
20,000 interaction points from 10,000 source rows.

**Next experiment:** replace per-row `flatMap` temporary arrays with a local
output array and loop, then evaluate specialized x/y projection or a combined projection
where both axes share inputs. Preserve source indices, invalid/null filtering,
configured-scale behavior, coordinate types and input immutability. Measure the
complete chart after any change; the sampled 47% is not a promised saving.
This is shared-core work and would benefit every adapter.

### 3. Batch dashboard measurements before surface writes

Thirty updates of 20 SVG charts produced **600 `UpdateLayoutTree` events** in
both fixed and responsive dashboard traces: twenty per update. They consumed
about **2.3 ms per update**, roughly 7% of the profiled dashboard duration.
CPU stacks attributed the repeated style reads to `dom-text.ts`'s
`readFontStyle()`, called by the renderer's font refresh before drawing.
The Chrome Performance tool also reported a forced-reflow insight for the
responsive dashboard.

**Next implementation:** introduce a core measurement snapshot or prepare/commit
boundary so the shared Angular host can collect reads before chart writes using
Angular render phases. Moving the existing mixed operation directly into a
`write` callback would still perform reads there. Preserve CSS font changes,
font loading, inherited typography and responsive observation. The full 2.3 ms
is an observed cost, not a guaranteed saving from batching.

### 4. Reduce SVG serialization and reconciliation work

In the dense SVG trace, approximately **43% of sampled active CPU** was
attributed to `reconcile.ts`, including native descendants. Thirty updates
spent about **419 ms in `ParseHTML` events**. The SVG surface serializes a new
string, parses it into a template, then walks and compares attributes even while
retaining the existing SVG nodes.

**Next experiment:** first optimize the attribute/child diff and avoid indexing
work that can be proven unchanged. A direct DOM commit path for built-in scenes
is a larger redesign; preserve the string-based custom renderer fallback,
namespaces, SVG references, keyed identity, focus layers, hydration and animation.
This cannot improve the Canvas pipeline.

### Lower priority: inactive default-focus candidates

The source review found 20,000 default-focus candidate nodes allocated per
10,000-row line-plus-dot update. An alternating same-page control disabled
`focusRing` only to estimate that cost. With no tracing, median SVG updates were
111.30 versus 110.45 ms, and Canvas updates were 48.30 versus 47.25 ms. Removing
the candidates did not materially change DOM counts: SVG had 10,047 versus
10,045 elements; Canvas retained 15 in both modes.

The measured benefit is small compared with projection and reconciliation.
Disabling focus rings changes behavior and is not a recommended optimization.
Lazy scene candidates would need to preserve the public scene, focus and
animation contracts before being considered.

### Reproduce the profiles

The browser runner uses installed Google Chrome and the Chrome DevTools
Protocol's timeline and 1 ms V8 CPU sampler. It rebuilds optimized AOT fixtures
with source maps and starts its own local fixture server:

```sh
pnpm --filter @charts-internal/angular-example benchmark --build-only
pnpm --filter @charts-internal/angular-example profile
pnpm --filter @charts-internal/angular-example profile:ssr
```

The browser runner supports `--skip-build` for unchanged source-mapped fixtures.
Raw `.trace.json.gz` and `.cpuprofile.gz` files and summaries are written to
`examples/charts-angular/.benchmark-output/angular-profiles/`. Load the trace in
Chrome DevTools' Performance panel to inspect it. The source-mapped result and
SSR samples are recorded in
`benchmarks/comparison/angular-adapters/2026-10-28-profile.json`.

Profiles used Google Chrome 156.0.8078.48 on the same Apple M1, with no throttling
and a 1280 × 800 viewport. Each case has six warm-up updates followed by thirty
traced updates; the untraced control alternates five blocks of twelve updates per mode
after two warm-up blocks. CPU attribution uses the nearest source-mapped frame
for native descendants and only samples inside marked update intervals. Timeline
events overlap CPU attribution and must not be added to it. Profiling overhead
and the different browser version mean these absolute timings must not be
compared directly with the earlier Chromium 151 benchmark.
