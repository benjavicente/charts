---
title: Angular Adapter Performance Comparison
description: Reproduce matched production measurements of the old and current Angular adapters, covering bundle size, server rendering, mounting, data updates and Canvas.
---

The native-host, signal-based adapter substantially reduces browser mounting
work. Its SVG data-update and server-rendering times are close to the old
adapter's, while its production bundle is larger. Both use the same chart
rendering pipeline.

## Directive-owned tooltip rendering — October 28

Custom Angular tooltip rendering is now owned by `ChartTooltipBodyDirective`.
Charts query a lightweight private token; they no longer import the directive,
body component, binding helper, or a tooltip outlet. The directive's node
provider creates the binding helper in its own injection context and uses its
`ViewContainerRef`. Core tooltip callback identity handles template replacement:
the previous callback receives `null`, and the new callback receives the current
target. There is no added synchronization effect, target registry, async import,
or public setup requirement. The component's template input is now required.

A matched production AOT size comparison uses committed Vite/Analog baseline
`51e96bc9` and the directive-owned working tree. Angular, chart core, compiler,
minifier, and fixture source are identical. This isolates tooltip ownership
from the earlier bundler change. Values are whole-application gzip bytes:

| Fixture                          | Before |  After | Change |
| -------------------------------- | -----: | -----: | -----: |
| SVG, no custom body              | 89,937 | 85,093 | -4,844 |
| Canvas, no custom body           | 91,174 | 86,291 | -4,883 |
| Both, no custom body             | 97,011 | 92,246 | -4,765 |
| SVG with ordinary core tooltip   | 94,534 | 89,643 | -4,891 |
| SVG with custom Angular template | 94,611 | 95,242 |   +631 |

The plain SVG app saves 4.73 KiB (5.39%); the ordinary core-tooltip app saves
4.78 KiB (5.17%). The custom-template app grows by 631 gzip bytes (0.67%).
The provider boundary has a cost when used; it shifts Angular rendering support
to its consumers. Applications already retaining that Angular support can see
a different marginal cost. These are fixture measurements, not universal sizes. For the custom-template
fixture, build metadata attributes 1,833 additional raw bytes to Angular core
and 339 fewer raw bytes to the adapter. Compressed contributions cannot be
assigned by subtracting those module sizes.

Compiled output checks confirm that SVG-only, Canvas-only, combined, and
ordinary-core-tooltip apps drop the Angular body component. The ordinary
core-tooltip fixture still retains the core tooltip extension. The custom
Angular-template app retains both its directive and component. Empty and legacy
controls are byte-identical, and hashes verify matching before/after fixture
sources. Published entries still contain one shared body component for consumers
that import the directive.

With Angular/core imports external, the linked SVG adapter changes from
3,443 to 1,886 gzip bytes. Retaining both SVG and the directive changes from
3,450 to 3,369 bytes. Those adapter-only values exclude transitive Angular
runtime support and therefore do not contradict the custom-template whole-app
increase. The earlier feature-disabled probe is superseded by this compatible
implementation and its actual application measurements.

Twenty compiled Angular tests pass, including active view reuse, target updates,
replacement, removal/restoration without a new focus event, nested charts,
portals, hide/reopen, and destruction. Angular 20 strict consumer compilation,
linked SSR with both strategies, and browser-runtime tooltip lifecycle checks
pass. Production Chromium verifies SVG/Canvas hydration, painting, callbacks,
tooltip updates and cleanup. All seven framework package gates pass.
No new rendering-latency or heap-retention improvement is claimed here.

Raw sizes, attribution, artifact/fixture hashes, retention assertions and
controls are recorded in
`benchmarks/comparison/angular-adapters/2026-10-28-tooltip.json`.
The benchmark runner accepts `--adapter-dir=<compiled-package-dist>` and
`--label=<output-name>` so both snapshots use the same fixture generator:

```sh
pnpm --filter @tanstack/angular-charts build
pnpm --filter @charts-internal/angular-example benchmark --apf --build-only --label=tooltip-after
pnpm --filter @charts-internal/angular-example benchmark:size
```

The example's separate `build` and `test:browser` commands verify its production
hydration and interactions; they are not needed for the size fixtures.
To reproduce the baseline, build the adapter sources from `51e96bc9` with the
same installed toolchain, then pass its dist directory through `--adapter-dir`.
The runner now builds additional default/custom tooltip size fixtures; the
historical runtime timings below still cover their original workloads only.

## Final branch measurements — October 28

These samples precede the subsequent Vite/Analog build migration and source
reorganization. That migration shares one tooltip component across entry chunks;
the independent-entry duplication described below is historical. The later directive-owned tooltip results above measure the compatible
implementation; the measurements in this historical section remain unchanged.

This follow-up measures the implementation through `306ce7af`, including the
optional SSR strategy. Current variants consume the **emitted Angular Package
Format entries**, linked and optimized by Angular CLI; legacy remains the exact
source snapshot from `778f2cc6`. All variants share Angular 22.0.8 and current
chart core. The raw result records emitted-artifact hashes, samples and p95s in
`benchmarks/comparison/angular-adapters/2026-10-28-final.json`.

### Final production application sizes

| Application        |   Minified |      Gzip |    Brotli |
| ------------------ | ---------: | --------: | --------: |
| Empty harness      | 101.53 KiB | 33.85 KiB | 30.54 KiB |
| Old SVG            | 243.95 KiB | 83.85 KiB | 74.35 KiB |
| Final SVG          | 258.40 KiB | 88.50 KiB | 78.07 KiB |
| Final Canvas       | 264.31 KiB | 89.61 KiB | 78.67 KiB |
| Final SVG + Canvas | 288.34 KiB | 95.65 KiB | 83.62 KiB |

The final SVG app is 4,763 gzip bytes larger than legacy (4.65 KiB, 5.55%).
These are whole-app sizes; the combined fixture renders both component types.
Browser build metadata confirms no platform-server dependency in these graphs.
A matched source-entry rerun measured 90,666 gzip bytes for SVG, versus 90,629
through APF. Neither consumption path changes the size conclusion. The old
October 27 source-entry SVG app measured 90,621 bytes; do not attribute the
APF/source difference to the SSR provider alone.

### Final browser mounting and immutable updates

Medians in milliseconds, using the same synchronous tick/layout boundary and
sample counts described below:

| Workload             | Mount old | Mount final | Update old | Update final |
| -------------------- | --------: | ----------: | ---------: | -----------: |
| 100 rows             |      2.25 |        1.20 |       1.00 |         1.10 |
| 1000 rows            |     13.50 |        5.40 |       7.20 |         7.20 |
| 10000 rows           |    142.25 |       55.55 |      77.25 |        77.65 |
| 20 charts × 100 rows |     39.05 |       18.35 |      20.45 |        20.70 |

Mounting is about 47–61% faster across these workloads. Data updates remain
close: the new architecture does not remove the core renderer's per-row work.
The 10,000-row Canvas update median is 65.60 ms versus 77.65 ms for final SVG.
Scheduled commits, frame proxies, teardown, and all individual samples remain
in the raw result; the large workload still exceeds a 16.7 ms frame.

### Default versus queued SSR

Immediately available data, median full-request milliseconds:

| Workload        | Old SVG | Final SVG effect | Final SVG queued | Canvas effect | Canvas queued |
| --------------- | ------: | ---------------: | ---------------: | ------------: | ------------: |
| 100 rows × 1    |    5.88 |             5.89 |             5.83 |          4.22 |          4.17 |
| 1,000 rows × 1  |   18.46 |            18.35 |            18.52 |          9.30 |          9.26 |
| 10,000 rows × 1 |  123.28 |           121.52 |           121.47 |         54.39 |         54.40 |
| 100 rows × 20   |   38.99 |            38.40 |            38.39 |         19.87 |         19.45 |

There is no meaningful initial-data SSR improvement from queuing: both paths
serialize once. Canvas outputs an unpainted shell and is not equivalent to
server-rendered visible SVG.

For the separate 10,000-row pending-task probe, both strategies run from the
same emitted server application, alternating order. Each cell has three
warm-ups and twenty samples, with GC outside the timing boundary:

| Late change      | Effect, ms | Queued, ms | Serializations, effect / queued |
| ---------------- | ---------: | ---------: | ------------------------------: |
| None             |     123.38 |     125.28 |                           1 / 1 |
| Replace callback |     214.03 |     123.05 |                           2 / 1 |
| Replace data     |     218.47 |     124.45 |                           2 / 1 |

Queued SSR reduces callback-only request time by about 43% and late-data request
time by about 43% in this workload. Both strategies produce exactly the same
final SVG for each scenario; late-data SVG differs from the unchanged chart.
These are matched results, not comparisons with the earlier probe's absolute
times. Queue setup does not benefit requests that would serialize only once.

### Hydration with matching server and client data

Median milliseconds from immediately before `bootstrapApplication()` through
`ApplicationRef.whenStable()`:

| Rows   | Old SVG | Final SVG | Final Canvas |
| ------ | ------: | --------: | -----------: |
| 100    |   16.75 |     15.00 |        16.00 |
| 1,000  |   32.50 |     26.10 |        24.30 |
| 10,000 |  161.20 |    112.85 |        99.45 |

Each cell has three warm-ups and twenty fresh-page samples, alternating adapter
order. Every sample checks the expected client line-plus-dot point count,
exact server SVG/line/circle or Canvas node reuse, one browser render, and no
page or console errors. An initial mismatched-data fixture was discarded before
collecting these results.

This measures bootstrap plus hydration and initial browser chart work. It
excludes network transfer, module parsing/evaluation before the bootstrap mark,
server HTML parsing, and GPU presentation. The Canvas comparison starts from
an unpainted shell. The SVG improvement is about 20% at 1,000 rows and 30% at
10,000 rows; it should not be described as a navigation-time improvement.

### Adapter-only size and remaining opportunities

Emitted APF entries are processed with the installed Angular CLI linker and
advanced optimizer, then bundled/minified as ES2022. Angular and chart imports
remain external. Values below are bytes, not whole-app contributions:

| Retained API                   | Minified |  Gzip | Brotli |
| ------------------------------ | -------: | ----: | -----: |
| SVG Chart                      |   10,904 | 3,449 |  3,070 |
| Canvas Chart                   |   11,212 | 3,405 |  3,050 |
| Both Charts                    |   20,993 | 4,194 |  3,516 |
| Tooltip directive only         |    1,138 |   559 |    492 |
| Strategy token only            |      777 |   412 |    342 |
| Server provider only           |    1,519 |   734 |    636 |
| Private tooltip component only |    6,139 | 1,829 |  1,589 |

**Most useful Angular size experiment:** make custom tooltip rendering
optional through the existing projected directive. Ordinary charts currently
retain the Angular tooltip body even without a custom template. An in-memory
probe drops only the SVG tooltip-component reference and measures 5,482 raw /
2,201 gzip bytes, versus 10,904 / 3,449. That 1,248-byte gzip reduction is an
adapter-only ceiling with custom tooltip rendering disabled, not a compatible
implementation or a promised whole-app saving.

A follow-up can investigate directive-owned rendering through a shared query
token, preserving the public binding and its inferred types. Validate both
with/without-template production apps, portals, template replacement,
hide/reopen, nested change detection, cleanup, and APF token/component identity.
The new task is recorded in `PLAN.md`; production behavior is unchanged here.

**Lower priority:** deduplicate private helpers/templates across emitted SVG
and Canvas entries. Both retained entries cost 20,993 raw / 4,194 gzip bytes,
versus SVG's 10,904 / 3,449. Compression already limits the increment to 745
gzip bytes with renderer imports external. An extra internal entry or public
implementation exports need a stronger benefit before accepting that complexity.

**Largest remaining speed work:** shared-core positional projection, SVG
serialization/reconciliation, and batching dashboard measurements. The prior
Chrome profiles below locate those costs; they are not new final-branch CPU
profiles. Keep projection outside the Angular adapter task. Small options
spreads and output wrappers are unlikely to improve dense-chart performance
when the wrapper was below 0.5% of sampled active CPU.

### Reproduce the follow-up

First build/finalize `packages/angular-charts/dist` using the framework package
gate (`node scripts/check-framework-adapters.mjs`). Then run:

```sh
pnpm --filter @charts-internal/angular-example benchmark --apf
pnpm --filter @charts-internal/angular-example profile:ssr --apf
pnpm --filter @charts-internal/angular-example benchmark --apf --hydration-only
pnpm --filter @charts-internal/angular-example benchmark:size
```

The APF run writes to `.benchmark-output/angular-adapters-apf`, hydration to
`.benchmark-output/angular-hydration`, and linked size probes to
`.benchmark-output/angular-size`, under the Angular example. `--skip-build`
requires fixtures built with the same mode. Build metadata and adapter hashes
are recorded. The size runner uses the installed CLI's internal transformer;
it must be checked when that toolchain changes. Browser commands on macOS
require permissions compatible with Chromium's bootstrap services.

These runs do not measure heap retention, sustained streaming, tooltip
interaction latency, resize throughput, or Angular 20 performance. They cover
the missing final-package sizes, optional SSR timing, and matched hydration
boundary without claiming those additional workloads.

## Historical October 27 measurements

These are local measurements from October 27, 2026, rather than performance
guarantees. The old adapter is the exact `Chart.ts`, `ChartTooltipBody.ts` and
`types.ts` from upstream `778f2cc6`. The current adapter is `6d417fbd`. Both
compile against the same current chart core and Angular dependencies, isolating
the adapter change from framework and renderer upgrades. These measurements
predate the optional SSR strategy added in `177cf0b7`; its final measurements are reported above. The reproduction scripts use the current checkout,
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
`packages/angular-charts/src/inject-chart-host.ts` at the profiled revision
(now under `src/host/`) observes the entire adapted
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
times in this historical section measure the earlier default effect. The
matched final-provider latency and size results are reported above. The `profile:ssr` runner intentionally
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
