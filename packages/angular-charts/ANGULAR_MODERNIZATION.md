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
- **Function-based Angular APIs:** `input`, `viewChild`, `contentChild`,
  `effect`, `afterNextRender`, and `DestroyRef` are used instead of input,
  query, and lifecycle decorators. The public selector, required `options`
  input, callbacks, and tooltip template contract remain unchanged.
- **Runtime private implementation details:** implementation fields and
  methods use ECMAScript `#private` where Angular does not inspect the field.
  Query signal fields intentionally remain `protected`: Angular's compiler
  rejects `#private` fields passed to `viewChild` or `contentChild`.
- **Simpler host sizing:** host style assembly is a small pure helper. It keeps
  the existing `position`, width, height/aspect-ratio defaults, and user style
  precedence while avoiding an intermediate filtered array.
- **Browser-only mounting:** `afterNextRender` owns the DOM mount, while
  `PLATFORM_ID` is retained as a defensive check for DOM-emulating SSR test
  runners. Server rendering still uses `prerender()` and never requires a DOM
  mount in a real server platform.
- **Stable DOM for compatibility:** the `.ts-chart-host` wrapper is retained.
  Moving it onto the `tanstack-chart` host element would alter the DOM shape,
  CSS selectors, and inline-element layout behavior for existing applications.
  The adapter therefore modernizes its internals without making that breaking
  structural change.
- **Angular-native tests:** the component tests run through Angular CLI's
  native Vitest builder, so Angular's compiler and partial-Ivy linking are
  exercised instead of maintaining a separate hand-built Vitest environment.
