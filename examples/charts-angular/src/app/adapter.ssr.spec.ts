import {
  Component,
  PendingTasks,
  inject,
  destroyPlatform,
  provideZonelessChangeDetection,
  signal,
  ɵsetDocument as setDocument,
} from '@angular/core'
import {
  bootstrapApplication,
  provideClientHydration,
} from '@angular/platform-browser'
import {
  provideServerRendering,
  renderApplication,
} from '@angular/platform-server'
import { ChartComponent } from '@tanstack/charts/angular'
import { DOCUMENT } from '@angular/common'
import { describe, expect, it } from 'vitest'
import { createRevenueChart, revenueData } from './comparison-charts'

const clientDocument = document
const ClientDOMParser = DOMParser
const clientDomTypes = {
  SVGSVGElement,
  SVGElement,
  Element,
  HTMLElement,
  Node,
  Document,
  DocumentFragment,
  Text,
  Comment,
  Event,
  KeyboardEvent,
  MouseEvent,
  DOMParser,
}
let browserMounts = 0

@Component({
  selector: 'server-chart',
  standalone: true,
  imports: [ChartComponent],
  template:
    '<div tanstack-chart id="server-revenue" [options]="options()"></div>',
})
class ServerChart {
  renderCount = 0
  readonly options = signal({
    definition: createRevenueChart(revenueData),
    height: 260,
    ariaLabel: 'Server revenue',
    onRender: () => {
      this.renderCount++
      browserMounts++
    },
  })
}

@Component({
  selector: 'async-server-chart',
  standalone: true,
  imports: [ChartComponent],
  template: '<div tanstack-chart [options]="options()"></div>',
})
class AsyncServerChart extends ServerChart {
  constructor() {
    super()
    const complete = inject(PendingTasks).add()
    setTimeout(() => {
      this.options.update((options) => ({
        ...options,
        height: 180,
        ariaLabel: 'Final server revenue',
      }))
      complete()
    }, 0)
  }
}

describe('signal Angular SSR', () => {
  it('emits complete SVG without mounting the browser runtime', async () => {
    browserMounts = 0
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          ServerChart,
          {
            providers: [provideZonelessChangeDetection()],
          },
          context,
        ),
      {
        document:
          '<!doctype html><html><body><server-chart></server-chart></body></html>',
      },
    )
    expect(browserMounts).toBe(0)
    expect(html).toContain('<svg')
    expect(html).toContain('class="ts-chart__line"')
    expect(html).toContain('aria-label="Server revenue"')
    expect(html).toContain('id="server-revenue"')
  })

  it('serializes late options before SSR becomes stable', async () => {
    browserMounts = 0
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          AsyncServerChart,
          {
            providers: [provideZonelessChangeDetection()],
          },
          context,
        ),
      {
        document:
          '<!doctype html><html><body><async-server-chart></async-server-chart></body></html>',
      },
    )
    expect(browserMounts).toBe(0)
    expect(html).toContain('aria-label="Final server revenue"')
    expect(html).not.toContain('aria-label="Server revenue"')
    expect(html).toContain('viewBox="0 0 640 180"')
  })

  it('adopts server SVG and mark nodes and preserves them through updates', async () => {
    browserMounts = 0
    destroyPlatform()
    const html = await renderApplication(
      (context) =>
        bootstrapApplication(
          ServerChart,
          {
            providers: [
              provideZonelessChangeDetection(),
              provideClientHydration(),
              provideServerRendering(),
            ],
          },
          context,
        ),
      {
        document:
          '<!doctype html><html><body><server-chart></server-chart></body></html>',
      },
    )
    const parsed = new ClientDOMParser().parseFromString(html, 'text/html')
    const nodes = [...parsed.body.childNodes].map((node) =>
      clientDocument.importNode(node, true),
    )
    clientDocument.body.append(...nodes)
    const svg = clientDocument.querySelector('#server-revenue svg')
    const line = clientDocument.querySelector(
      '#server-revenue .ts-chart__line path',
    )
    expect(svg).not.toBeNull()
    expect(line).not.toBeNull()
    // This isolated test runs server and browser phases in the same process.
    // Angular platform-server sets this global when its module is loaded.
    const serverMode = Reflect.get(globalThis, 'ngServerMode')
    Object.assign(globalThis, clientDomTypes)
    Reflect.set(globalThis, 'ngServerMode', false)
    setDocument(clientDocument)
    try {
      const app = await bootstrapApplication(ServerChart, {
        providers: [
          provideZonelessChangeDetection(),
          provideClientHydration(),
          { provide: DOCUMENT, useValue: clientDocument },
        ],
      })
      try {
        await app.whenStable()
        const host = app.components[0].instance as ServerChart
        expect(host.renderCount).toBeGreaterThan(0)
        expect(clientDocument.querySelector('#server-revenue svg')).toBe(svg)
        expect(
          clientDocument.querySelector('#server-revenue .ts-chart__line path'),
        ).toBe(line)
        host.options.update((options) => ({
          ...options,
          ariaLabel: 'Updated server revenue',
        }))
        await app.whenStable()
        expect(clientDocument.querySelector('#server-revenue svg')).toBe(svg)
        expect(svg?.getAttribute('aria-label')).toBe('Updated server revenue')
      } finally {
        app.destroy()
      }
    } finally {
      Reflect.set(globalThis, 'ngServerMode', serverMode)
      for (const node of nodes) node.parentNode?.removeChild(node)
    }
  })
})
