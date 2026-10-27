import { provideZonelessChangeDetection } from '@angular/core'
import {
  bootstrapApplication,
  provideClientHydration,
} from '@angular/platform-browser'
import type { BootstrapContext } from '@angular/platform-browser'
import { provideServerRendering, RenderMode, withRoutes } from '@angular/ssr'
import { App } from './app/App'

export default (context: BootstrapContext) =>
  bootstrapApplication(
    App,
    {
      providers: [
        provideZonelessChangeDetection(),
        provideClientHydration(),
        provideServerRendering(
          withRoutes([{ path: '**', renderMode: RenderMode.Prerender }]),
        ),
      ],
    },
    context,
  )
