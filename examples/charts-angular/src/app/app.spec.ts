import { TestBed } from '@angular/core/testing'
import { describe, expect, it } from 'vitest'
import { App } from './app'

describe('Angular chart example', () => {
  it('compiles the unified import and renders the chart', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents()
    const fixture = TestBed.createComponent(App)
    fixture.detectChanges()

    const host = fixture.nativeElement.querySelector('.ts-chart-host')
    const svg = fixture.nativeElement.querySelector('svg')
    expect(host.classList.contains('ts-chart-host')).toBe(true)
    expect(host.classList.contains('revenue-chart')).toBe(true)
    expect(svg?.getAttribute('aria-label')).toBe('Monthly revenue')
  })

  it('updates when a signal provides new immutable options', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents()
    const fixture = TestBed.createComponent(App)
    fixture.detectChanges()
    fixture.componentInstance.options.update((options) => ({
      ...options,
      ariaLabel: 'Updated monthly revenue',
    }))
    fixture.detectChanges()

    expect(
      fixture.nativeElement.querySelector('svg')?.getAttribute('aria-label'),
    ).toBe('Updated monthly revenue')
  })
})
