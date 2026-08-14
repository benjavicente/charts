# Angular adapter modernization notes

This file records the compatibility-minded changes in the Angular 20 adapter.
It is intended for maintainers reviewing the implementation, not as a second
public API reference.

## Changes and reasons

- **Signal-based adapter state:** the adapter and its server-safe initial SVG
  markup are modeled as separate graph nodes. Pure `computed` signals derive
  the renderer and `ChartRendererHostOptions`; a dependency-free `computed`
  with `untracked` creates one mutable adapter controller; a separate
  dependency-free `computed` captures its initial `prerender()` output. An
  Angular `effect` synchronizes `adapter.update(hostOptions)` while render
  scheduling owns mount and teardown. This mirrors Solid's `createMemo` for
  renderer/options and local adapter ownership without recreating the
  renderer on every update.
- **Angular CDK tooltip portals:** tooltip context is a stable object whose
  getters read a signal-backed target, so Angular templates react to tooltip
  changes without mutating an `EmbeddedViewRef` context by hand. CDK's
  `TemplatePortal`/`DomPortalOutlet` creates the embedded view in the chart's
  original `ViewContainerRef`, moves its root nodes to the renderer-owned
  tooltip element, and owns detach/disposal. This preserves the template's
  logical Angular view tree while removing duplicated portal lifecycle code.
- **Local tooltip hook:** the public `Chart` class keeps the renderer graph
  directly in the component, while the local `injectChartTooltipBody` helper
  owns tooltip target state, template context, and portal reconciliation. Its
  returned controller is template-visible as `tooltipBody`, so the template
  reads nested signals without alias fields.
- **Function-based Angular APIs:** `input`, `viewChild`, `contentChild`,
  `effect`, `afterNextRender`, and `DestroyRef` are used instead of input,
  query, and lifecycle decorators. The required `options` input, callbacks, and
  tooltip template contract remain unchanged; the selector and host styling
  contract intentionally changed as documented below.
- **Runtime private implementation details:** implementation fields and
  methods use ECMAScript `#private` where Angular does not inspect the field.
  Query signal fields intentionally remain `protected`: Angular's compiler
  rejects `#private` fields passed to `viewChild` or `contentChild`.
- **Simpler host sizing:** host style assembly is a small pure helper. It keeps
  the `display`, position, width, and height/aspect-ratio defaults while user
  classes and styles stay on the host element.
- **Browser-only mounting:** `afterNextRender` owns the DOM mount, while
  `PLATFORM_ID` is retained as a defensive check for DOM-emulating SSR test
  runners. Server rendering still uses `prerender()` and never requires a DOM
  mount in a real server platform.
- **Breaking host simplification:** the selector is now `div[tanstack-chart]`.
  The caller's element is the `.ts-chart-host`, so classes and styles belong on
  the element instead of an Angular-only `ChartPresentationOptions` object.
  This intentionally changes the DOM shape and selector contract to remove the
  redundant wrapper; the migration is documented as a breaking Angular adapter
  change.
- **Angular-native tests:** the component tests run through Angular CLI's
  native Vitest builder, so Angular's compiler and partial-Ivy linking are
  exercised instead of maintaining a separate hand-built Vitest environment.
