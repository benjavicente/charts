# Angular adapter modernization notes

This file records the compatibility-minded changes in the Angular 20 adapter.
It is intended for maintainers reviewing the implementation, not as a second
public API reference.

## Changes and reasons

- **Signal-based adapter state:** the adapter and its server-safe initial SVG
  markup are held in a linked signal. An Angular `effect` reads the input and
  content-query signals directly, then synchronizes the existing adapter
  instance. The linked-signal computation only creates the controller; the
  imperative `adapter.update()` belongs to the effect. This follows the
  signal-driven structure used by the Angular Query and Angular Hotkeys
  adapters without recreating the renderer on every update.
- **Angular-owned tooltip views:** tooltip context is a stable object whose
  getters read a signal-backed target, so Angular templates react to tooltip
  changes without mutating an `EmbeddedViewRef` context by hand. An internal
  standalone outlet component is mounted with `createComponent` on the
  renderer-owned tooltip element; `ApplicationRef` and `ViewContainerRef` now
  own attachment, change detection, and destruction instead of moving root DOM
  nodes manually. The outlet is `OnPush` because tooltip updates explicitly
  trigger its embedded view.
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
