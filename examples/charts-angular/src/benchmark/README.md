# Angular adapter performance harness

This harness compares the exact `main` branch Angular adapter with the adapter
on the current branch under one Angular 20 compiler and runtime.

Generate the ignored baseline before building or testing:

```sh
pnpm --filter @charts-poc/angular-example benchmark:prepare
```

Run the browser benchmark:

```sh
pnpm --filter @charts-poc/angular-example benchmark:build
pnpm --dir examples/charts-angular exec ng serve --configuration benchmark
```

Open the served page in a real browser and choose **Run benchmark**. The
harness alternates old/new execution order and reports median per-chart mount,
immutable update, destroy, and total times.

Run the server-rendering benchmark:

```sh
pnpm --filter @charts-poc/angular-example benchmark:ssr
```

The old adapter registers an unguarded `afterNextRender` callback and attempts
to mount during Angular 20 server rendering. The SSR harness supplies a server
document that can tolerate this old behavior so a numeric comparison can
finish. The modern adapter checks `PLATFORM_ID` and remains prerender-only.

Do not treat a single local run as a release threshold. Repeat browser runs,
alternate order, and compare medians on the same machine without other build
jobs running.
