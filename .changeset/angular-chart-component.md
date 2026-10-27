---
'@tanstack/charts': major
'@tanstack/angular-charts': major
---

Replace the Angular Chart implementation with a native div[tanstack-chart] host,
signal inputs and queries, lazy adapter ownership, fresh tooltip primary points,
and untracked interaction operations. Remove the old tanstack-chart element
selector. Keep the Chart and ChartOptions names; move host class/style options
to native Angular bindings and keep className for the rendered surface. Chart.options and
ChartTooltipBodyDirective.definition are now input signals, with unchanged template
binding names. Require Angular 20 or later for dynamic tooltip input bindings.
Add rendered, focusChange, focusGroupChange, and pointSelect outputs alongside the
existing callbacks. Share option updates across browser and server and hydrate
server SVG nodes in place. Document the old/new comparison and migration.
