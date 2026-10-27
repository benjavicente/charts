import { provideZonelessChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { App } from './app/App'

bootstrapApplication(App, {
  providers: [provideZonelessChangeDetection()],
}).catch(console.error)
