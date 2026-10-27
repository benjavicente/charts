import { provideZonelessChangeDetection } from '@angular/core'
import {
  bootstrapApplication,
  provideClientHydration,
} from '@angular/platform-browser'
import { App } from './app/App'

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection(), provideClientHydration()],
}).catch(console.error)
