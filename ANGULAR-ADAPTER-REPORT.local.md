# Angular adapter modernization report

This report describes the completed signal-first Angular implementation, its compatibility changes, and the checks performed. The new `ChartComponent` is exported from the existing Angular entry point alongside the deprecated `Chart`; consumers do not need a separate `signal-angular` entry point.

## Correctness fixes

### Tooltip context stays current

The original component could retain a stale `primaryPoint` while updating the rest of a reused tooltip context. Moving focus from January to February could therefore display February's tooltip content while a custom template still read January's datum through `primaryPoint`.

The new implementation updates the complete context: `primaryPoint`, `points`, `content`, `pinned`, `dismiss`, `defaultBody`, and `$implicit`. Custom templates and the default body agree about the active point.

### Consumer signal reads do not become adapter dependencies

Callbacks and imperative operations run through `untracked`. Reading a signal inside `onRender`, `onFocusChange`, `onFocusGroupChange`, or `onSelect` no longer accidentally subscribes an invoking Angular effect to that signal. Interaction methods receive the same protection, with stable wrappers for `clientToScene`, `resolvePointer`, and `setControlledFocus`.

The comparison example reproduces the original extra focus-effect execution after an unrelated log-format signal changes; the new adapter avoids that execution.

### Native host identity and sizing refer to the same element

Previously, attributes such as `id`, `data-*`, and usage-site classes belonged to `<tanstack-chart>`, while the inner `.ts-chart-host` owned layout. Compound selectors combining identity and the chart-host class did not reach that inner element. A height binding on the custom element could also leave the chart at its internal default height.

The new selector, `div[tanstack-chart]`, puts identity, native Angular bindings, `.ts-chart-host`, and layout on one element. The comparison verifies identity-dependent styles and a 180px bordered host with a 176px content area, instead of the original 320px internal height.

### Tooltip replacement and teardown follow Angular ownership

Changing or removing the projected tooltip template updates the rendered body independently of whether the core emits another target change. Changing active points reuses the embedded view. Hiding the tooltip destroys that view; reopening creates a fresh one, matching the React and Solid lifecycle. Consequently, local state inside a custom tooltip resets after an actual hide.

Target replacement, template removal, and chart destruction release the Angular-owned component and view. Cleanup does not destroy the reusable tooltip body element owned by the core.

## Rendering and design improvements

### One options-update implementation

One shared callback contains the component's sole `adapter.update(options)` call. It is registered once using `afterRenderEffect` in the browser or `effect` on the server. Only scheduling differs; option transformation and application are shared. Server serialization follows the same update inside that callback.

Browser updates run after Angular applies host bindings. The explicit `mixedReadWrite` phase reflects the core operation's combined DOM measurements and writes. A separate `afterNextRender` callback mounts once, without a reactive mounted flag or duplicated update branches.

### Lazy, stable renderer ownership

The renderer adapter is created lazily on its first imperative use, outside reactive tracking, and retained for the component lifetime. Destruction is registered with the owning `DestroyRef` when the adapter is created. There is no effect whose sole purpose is constructing the adapter and no lifecycle ownership inside a computed value.

Destroying a component before its required input or view query becomes available is safe. Ordinary option, data, and dimension updates preserve renderer/controller identity and the existing SVG. The renderer is memoized against the `renderSvg` callback.

### Native host styling and explicit SVG styling

The host directly owns `position: relative` and the responsive width default. Angular's numeric width and height bindings replace manual pixel-string conversion. Height defaults to 320px when neither an explicit height nor a valid aspect ratio is provided; explicit dimensions, positive aspect ratios, and resets are covered by verification.

Usage-site class and style bindings use Angular's normal binding precedence. `ChartComponentOptions` excludes presentation fields `class` and `style`, and replaces the SVG-targeting `className` field with `svgClass`. This makes the target of the class explicit. If native CSS should determine height, omit the scene-sizing `height` and `aspectRatio` options.

### Angular-native tooltip rendering

A private tooltip component owns Angular rendering through `NgTemplateOutlet`. A `ViewContainerRef` declared in the chart template creates it with the owning view's injection context and manages attachment and removal. It receives both target and template through `ComponentRef.setInput`. The adapter only places Angular's generated host into the body element supplied by the core; no CDK dependency is required.

The helper no longer needs a separate target signal, context getters, manually moved root nodes, manual `detectChanges`, a body-host signal, or a dismiss-inactive fallback. It also avoids manual host creation, `ApplicationRef` attachment/detachment, explicit injector plumbing, and a redundant native host-removal call. Its effect only observes projected template changes; core target notifications update the component input directly. The default tooltip retains the shared text, structured rows, swatches, active styling, and CSS-variable styling conventions.

### Server rendering and hydration

Server rendering serializes current options without mounting, measuring the DOM, or invoking `onRender`. Late option changes before server stabilization are included in the HTML. Hydration adopts the existing server SVG and mark nodes, and subsequent updates preserve them. A continuing browser `innerHTML` binding does not replace the mounted runtime.

These are verified lifecycle guarantees of the new implementation; they are not all independently demonstrated defects in the original component.

### Explicit Angular contracts

The component uses required signal inputs, signal queries, pure computed derivation, ECMAScript private implementation fields, and explicit standalone and OnPush settings. Compiler-managed signal queries remain protected because Angular rejects ECMAScript-private query declarations. The tooltip directive keeps its value-shaped `definition` input and generic template-context inference. Established source filenames remain deliberate and unchanged.

## Deprecations and API changes

**The only public declaration formally marked `@deprecated` is `Chart`.** Deprecation preserves its export and implementation; no removal version is scheduled.

| API                                                                    | Current status                                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Chart`                                                                | Formally deprecated. Use `ChartComponent`.                                                                                                       |
| `<tanstack-chart>`                                                     | Retained selector of the deprecated component. New usage is `<div tanstack-chart>`.                                                              |
| `ChartComponent`                                                       | New supported component, exported from the existing Angular entry point.                                                                         |
| `ChartComponentOptions`                                                | New options type for `ChartComponent`; includes `svgClass`.                                                                                      |
| `ChartOptions`, `ChartCommonOptions`, `ChartPresentationOptions`       | Retained legacy types. They are **not** individually annotated `@deprecated`.                                                                    |
| Legacy `options.class` and `options.style`                             | Still supported by `Chart`; excluded from `ChartComponentOptions`. Bind host class/style in the Angular template.                                |
| Legacy `options.className`                                             | Still supported by `Chart`; the new Angular component uses `svgClass` for the root SVG. Core and other adapters' `className` APIs are unchanged. |
| `[options]` template binding                                           | Supported by both components. On a `ChartComponent` instance, `options` is a signal and is read as `options()`.                                  |
| `ChartTooltipBodyDirective` and `[tanstackChartTooltipBody]`           | Supported, unchanged public directive contract; not deprecated.                                                                                  |
| Tooltip render/template context types, `ChartDefinition`, `ChartPoint` | Retained supported exports; not deprecated.                                                                                                      |

The migration involves more than changing the selector: import `ChartComponent`, use `ChartComponentOptions`, move host presentation to native bindings, and rename an SVG class option to `svgClass`. Framework-agnostic chart definitions and data configuration remain reusable.

## Examples, documentation, and tooling

- The Angular example compares original and new adapters in two columns, sharing chart definitions and data. Its rows demonstrate tooltip freshness, incidental signal tracking, native identity and sizing, and reactive updates with unmount/remount.
- Styling follows the other adapter examples. Desktop, mobile, light, and dark presentations were reviewed.
- Angular adapter and reference documentation describe the new component and migration. Generated documentation was synchronized through the repository's sync process.
- Strict template checks preserve inferred datum and axis types and reject legacy presentation fields in the new options type.
- Public callback inventory handling now excludes ECMAScript-private members instead of exposing implementation methods as public callbacks.
- The example test setup uses source-entry path mappings for Angular AOT compilation. Angular CLI caching is disabled to avoid the observed native LMDB failure in this environment.

## Verification performed

- Nine compiled Angular 22.0.8 tests passed: six browser tests and three server/hydration tests. They cover tooltip context and lifecycle, callback tracking, stable renderer identity, post-binding sizing, native/SVG classes, template replacement, early destruction, server serialization, late server options, and hydration node preservation.
- Package partial compilation, strict generic template/type checks, and the production Angular example build passed.
- Isolated Angular 19.0.0 and 20.0.0 compilation/runtime checks passed, including fixed-width sizing, tooltip updates and teardown, callback tracking, and stable SVG identity.
- Browser comparison checks reproduced the two original correctness issues and verified native identity/styles, resizing, data updates, retained SVG nodes, remounting, themes, and mobile layout without page errors. The in-app browser was also reviewed.
- Documentation synchronization, formatting, and diff whitespace checks passed. Direct public callback inventory validation passed across 816 surfaces with no reported errors.

The full public-callback test suite timed out during its 30-second setup hook; its seven tests were skipped, so that suite is not reported as passing. Full repository CI was not run.

## Compatibility and scope

The implementation targets signal-first, zoneless applications; this work does not add Zone.js application support. Angular peer compatibility remains `>=19`, with versions 19, 20, and 22 checked. `@angular/common` is now a peer dependency of the Angular package for `NgTemplateOutlet`, with the corresponding optional peer declaration on the umbrella package.

Package versions remain unchanged at 1.1.0. The legacy component remains available, and no separate adapter entry point or version bump was applied.
