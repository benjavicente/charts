import { provideZonelessChangeDetection } from '@angular/core'
import {
  bootstrapApplication,
  provideClientHydration,
} from '@angular/platform-browser'
import type { BootstrapContext } from '@angular/platform-browser'
import { provideServerRendering, RenderMode, withRoutes } from '@angular/ssr'
import { App } from './app/App'
import { provideChartsServerRendering } from '@tanstack/charts/angular/server'

export default (context: BootstrapContext) =>
  bootstrapApplication(
    App,
    {
      providers: [
        provideChartsServerRendering(),
        provideZonelessChangeDetection(),
        provideClientHydration(),
        provideServerRendering(
          withRoutes([{ path: '**', renderMode: RenderMode.Prerender }]),
        ),
      ],
    },
    context,
  )
