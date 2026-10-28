# Angular adapter size analysis

Updated October 28, 2026. The adapter now exports `Chart` for SVG and an
optional Canvas-default `Chart` entry, requires Angular 20, and retains
`className`. The deprecated-component/`ChartComponent` comparison below records
an earlier implementation, not the current package API.

## Latest matched production measurements

The October 27 benchmark compares upstream `778f2cc6` with `6d417fbd`, using the
same Angular 22.0.8 runtime and chart core. Each application is production AOT
compiled and includes the benchmark harness.

| Application           |   Minified |      Gzip |    Brotli |
| --------------------- | ---------: | --------: | --------: |
| Empty Angular harness | 101.53 KiB | 33.85 KiB | 30.54 KiB |
| Old SVG adapter       | 243.95 KiB | 83.85 KiB | 74.35 KiB |
| New SVG adapter       | 258.03 KiB | 88.50 KiB | 78.00 KiB |
| New Canvas adapter    | 263.96 KiB | 89.61 KiB | 78.67 KiB |

The new SVG application adds 4,755 gzip bytes (4.64 KiB, 5.54%). These are
whole-app measurements, not standalone adapter sizes. They supersede the older
fixture below for comparing the removed adapter with the new architecture.
Different fixtures prevent direct comparisons between the two tables.

The optional serialization-time SSR strategy added in `177cf0b7` has **not**
been rebenchmarked for size or latency. Its browser entries were checked to
exclude platform-server imports; that is a dependency-boundary check, not a
claim of zero bundle-size cost.

See [the performance report](docs/framework/angular/performance.md) for methods,
timings, limitations, and reproduction commands, and
[the raw samples](benchmarks/comparison/angular-adapters/2026-10-27.json).

## Historical intermediate implementation

Everything below describes the earlier coexistence of deprecated `Chart` and
signal-first `ChartComponent`. Those exports no longer coexist in the package.
Sizes, tree-shaking observations, and proposed sharing opportunities apply to
that snapshot only; they are not recommendations based on the current source.

## Method

- Angular runtime/compiler 22.0.8, Angular CLI/build 22.2.2, esbuild 0.27.7, Node 24.17.0, ES2022.
- The adapter was consumed through its ng-packagr package output, linked and optimized for production. Core chart imports used the same workspace exports in every case.
- Complete apps use identical data, a line chart, linear scales, tooltip extension, accessible label, fixed dimensions, and zoneless bootstrap. The baseline retains that chart configuration but renders no adapter.
- Each of the six application cases was built twice. The resulting JavaScript SHA-256 hashes matched for every repeated case.
- Raw sizes are minified JavaScript bytes. Gzip uses level 9; Brotli uses quality 11. Each app produced one JavaScript file. CSS, HTML, source maps, and license files are excluded.
- A separate adapter-only measurement uses the same production linker/optimization pass and leaves Angular and chart core external. This separates integration code from transitive runtime cost.

## Complete production apps

| Case                                                 | Minified bytes | Gzip bytes | Brotli bytes |
| ---------------------------------------------------- | -------------: | ---------: | -----------: |
| Baseline: bootstrap and retained chart configuration |        130,181 |     45,544 |       40,763 |
| Deprecated Chart                                     |        256,344 |     88,222 |       78,088 |
| Signal ChartComponent                                |        263,288 |     90,436 |       79,775 |
| Both components                                      |        273,586 |     93,017 |       81,964 |
| Deprecated Chart with a custom tooltip template      |        256,825 |     88,337 |       78,126 |
| Signal ChartComponent with the same custom template  |        263,498 |     90,493 |       79,872 |

Replacing legacy with signal adds **6,944 raw / 2,214 gzip / 1,687 Brotli bytes**. The gzip increase is approximately 2.5% of this legacy app's JavaScript.

Adding the new component while retaining legacy adds **17,242 raw / 4,795 gzip / 3,876 Brotli bytes**. After migrating and dropping legacy usage, the combined app sheds **10,298 raw / 2,581 gzip / 2,189 Brotli bytes**.

Relative to the baseline, adding legacy costs 126,163 raw / 42,678 gzip bytes; adding signal costs 133,107 raw / 44,892 gzip bytes. These increments include the renderer and interaction runtime, not just the Angular component.

These are marginal costs in this fixture, not universal installation prices. An application that already retains signal-query, render-effect, or template-outlet runtime code may see a smaller difference. Angular version, bundler version, features, and compression also affect results.

## Adapter-only bundles

| Retained exports               | Minified bytes | Gzip bytes | Brotli bytes |
| ------------------------------ | -------------: | ---------: | -----------: |
| Chart                          |          9,802 |      3,006 |        2,684 |
| ChartComponent                 |          9,985 |      3,122 |        2,778 |
| Both                           |         18,802 |      4,656 |        4,121 |
| ChartTooltipBodyDirective only |          1,013 |        504 |          468 |

The new adapter adds only **183 raw / 116 gzip bytes** in this measurement. This excludes the cost of the Angular APIs those integrations use.

The complete-app build metadata attributes 7,461 output bytes to the adapter module for legacy and 7,557 for signal: a 96-byte difference. The new app retains approximately 5,463 more bytes from Angular core and 1,236 more from Angular common. Chart core contributes the same 99,674 bytes in both cases. Metadata attribution is for raw output and does not provide independent compressed contributions; gzip deltas cannot be assigned by subtracting individual module sizes.

## Tree shaking

Verified in both linked adapter bundles and complete production apps:

- Legacy-only output retains the legacy selector and drops the signal component selector and its private tooltip component.
- Signal-only output retains the native-host selector and drops the legacy selector.
- Both-component output retains both selectors while sharing chart core and Angular runtime code.
- Directive-only output drops both chart components and the private tooltip component.

There is a more limited boundary inside each component. Both retain their Angular default-tooltip implementation even when the application supplies no custom tooltip template. The absence of projected content is a runtime query result, so the optimizer cannot remove the reachable rendering implementation.

Adding the small custom template costs just 115 gzip bytes for legacy or 57 for signal in this fixture. That small increment does not mean custom-tooltip support is free: most of its supporting code is already retained.

## Where sharing could help

### Default tooltip rendering: the largest adapter-level opportunity

The legacy component embeds its own structured default-tooltip template; the new private body component contains substantially similar title, row, swatch, and active-style rendering. Both-component consumers retain both implementations.

For scale, retaining the existing private tooltip component alone costs 5,804 raw / 1,699 gzip bytes with Angular external. Retaining its component plus bridge costs 6,226 raw / 1,884 gzip bytes. These are separately compressed bundles, not additive contributions or promised savings.

A shared default-content renderer could remove duplicated template instructions when both adapters are used. It may add component metadata, bindings, or a host to legacy-only usage, so sharing should be judged across all three scenarios: legacy, signal, and both. Reusing the current body component directly is not equivalent: it renders a custom template and provides defaultBody, rather than simply rendering default content.

Static tooltip styling and repeated active-row style bindings are also candidates for investigation. Moving them into Angular-owned styles may shorten generated templates, but stylesheet and style-registration costs must be included. A new consumer stylesheet requirement would be an API change, not a transparent size cleanup.

### Make Angular custom-tooltip support optional: potentially useful, more invasive

The default tooltip is already rendered by the core when no Angular custom body is registered. There may therefore be a way to avoid retaining the Angular custom-body machinery in ordinary charts.

Simply moving it into ChartTooltipBodyDirective is insufficient: the component's content query references that class, making its implementation reachable. A real boundary would require decoupling the component from the concrete renderer-bearing directive, for example through an internal token/protocol. The shared public directive and deprecated adapter complicate that boundary; this needs a separate compatibility and lifecycle design before any savings can be claimed.

This is a source-supported opportunity, not an implemented or benchmarked alternative.

### ID generation: small and mainly useful during migration

Both components define similar root-provided ID generators. Sharing construction/sanitization may trim duplicate service code in a both-component bundle. Prefix and SSR ID behavior need to remain correct. A single-component consumer already drops the unused generator, so sharing is unlikely to materially reduce that consumer's bundle.

### Callback and option helpers: lower priority

SVG validation and render-context conversion overlap, but the signal component adds untracked callback and interaction boundaries. A focused shared SVG-context helper may reduce duplication in a combined bundle. Sharing entire lifecycle or options implementations would mix different contracts and could make unused behavior reachable.

The lazy renderer-ownership helper alone measures 758 raw / 386 gzip bytes with external dependencies. It is small, includes necessary disposal logic, and is not a leading size target. Both adapters already share the large framework-agnostic renderer/runtime implementation.

## Behavior and recommendation

The size increase accompanies fresh tooltip context, untracked consumer callbacks/operations, native host identity and bindings, signal-based updates, and template-owned tooltip views. Current tests cover active-view reuse, hide/reopen, projected-template changes, destruction, server options, and hydration. This analysis does not benchmark CPU time, allocations, or animation performance, and bundle size does not establish those improvements.

Prioritize researching shared default-tooltip rendering and its styling, then evaluate an optional Angular tooltip boundary. Treat ID and callback sharing as smaller follow-ups. Keep the existing lifecycle and correctness protections while measuring alternatives; the current implementation improves behavior and structure, but it does not yet improve bundle size.
