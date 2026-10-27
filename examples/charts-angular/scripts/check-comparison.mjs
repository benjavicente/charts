import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '../dist/charts-angular/browser')
const server = createServer(async (request, response) => {
  const path = resolve(
    root,
    '.' + new URL(request.url, 'http://localhost').pathname,
  )
  if (!path.startsWith(root + sep) && path !== root) {
    response.writeHead(403).end()
    return
  }
  try {
    const file = path === root ? resolve(root, 'index.html') : path
    response.setHeader(
      'Content-Type',
      {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
      }[extname(file)] ?? 'application/octet-stream',
    )
    response.end(await readFile(file))
  } catch {
    response.writeHead(404).end()
  }
})
await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
const browser = await chromium.launch()
try {
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Inspect the server HTML before the browser bootstrap can hydrate it.
  const client = Promise.withResolvers()
  await page.route('**/*.js', async (route) => {
    await client.promise
    await route.continue()
  })
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}`, {
      waitUntil: 'commit',
    })
    await page.waitForSelector('[data-adapter="signal"] svg')
    await page.evaluate(() => {
      window.serverCharts = [
        ...document.querySelectorAll('[data-adapter="signal"] svg'),
      ].map((svg) => ({ svg, mark: svg.querySelector('.ts-chart__line path') }))
    })
    assert.equal(await page.evaluate(() => window.serverCharts.length), 4)
  } finally {
    client.resolve()
  }
  await page.waitForFunction(
    () => document.querySelectorAll('svg').length === 8,
  )
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-tooltip-adapter="signal"] [data-testid="tooltip-primary"]',
      )?.textContent === 'January',
  )
  assert.equal(
    await page.evaluate(() =>
      window.serverCharts.every(
        ({ svg, mark }) =>
          svg.isConnected &&
          mark !== null &&
          mark.isConnected &&
          svg.querySelector('.ts-chart__line path') === mark,
      ),
    ),
    true,
    'Hydration must adopt the server SVG and mark nodes',
  )
  await page.unroute('**/*.js')
  const tooltip = (adapter) =>
    page.locator(
      `[data-tooltip-adapter="${adapter}"] [data-testid="tooltip-primary"]`,
    )
  await page.getByRole('button', { name: 'February', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-tooltip-adapter="signal"] [data-testid="tooltip-primary"]',
      )?.textContent === 'February',
  )
  assert.equal(await tooltip('original').textContent(), 'January')
  assert.equal(await tooltip('signal').textContent(), 'February')

  const effect = page.locator('[data-case="effect"]')
  await effect.getByRole('button', { name: 'Focus next month' }).click()
  await page.waitForFunction(() =>
    [
      ...document.querySelectorAll(
        '[data-case="effect"] [data-testid="effect-runs"]',
      ),
    ].every((element) => element.textContent === '1'),
  )
  await effect.getByRole('button', { name: 'Change logging format' }).click()
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-case="effect"] [data-adapter="original"] [data-testid="effect-runs"]',
      )?.textContent === '2',
  )
  assert.deepEqual(
    await effect.locator('[data-testid="effect-runs"]').allTextContents(),
    ['2', '1'],
  )

  const host = page.locator('[data-case="host"]')
  const heights = () =>
    host.locator('[data-testid="scene-height"]').allTextContents()
  assert.deepEqual(await heights(), ['320px', '176px'])
  const compoundSelector = (owner, adapter) =>
    `.ts-chart-host#host-${owner}-${adapter}[data-owner="${owner}"].chart-host-${owner}-${adapter}`
  assert.equal(
    await host.locator(compoundSelector('revenue', 'original')).count(),
    0,
  )
  assert.equal(
    await host.locator(compoundSelector('revenue', 'signal')).count(),
    1,
  )
  await host.getByRole('button', { name: 'Change host identity' }).click()
  await page.waitForSelector(compoundSelector('forecast', 'signal'))
  assert.equal(
    await host
      .locator(compoundSelector('forecast', 'signal'))
      .evaluate((element) => getComputedStyle(element).borderTopColor),
    'rgb(8, 145, 178)',
  )
  await host.getByRole('button', { name: 'Change host height' }).click()
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-case="host"] [data-adapter="signal"] [data-testid="scene-height"]',
      )?.textContent === '256px',
  )
  assert.deepEqual(await heights(), ['320px', '256px'])

  const lifetime = page.locator('[data-case="lifetime"]')
  await lifetime.locator('[data-adapter="signal"] svg').evaluate((element) => {
    window.comparisonSvg = element
  })
  const before = await lifetime
    .locator('[data-adapter="signal"] .ts-chart__line path')
    .getAttribute('d')
  await lifetime.getByRole('button', { name: 'Update data' }).click()
  await page.waitForFunction(
    (path) =>
      document
        .querySelector(
          '[data-case="lifetime"] [data-adapter="signal"] .ts-chart__line path',
        )
        ?.getAttribute('d') !== path,
    before,
  )
  await lifetime.getByRole('button', { name: 'Change dimensions' }).click()
  await page.waitForFunction(
    () =>
      document.querySelector(
        '[data-case="lifetime"] [data-adapter="signal"] [data-testid="scene-height"]',
      )?.textContent === '320px',
  )
  assert.equal(
    await lifetime
      .locator('[data-adapter="signal"] svg')
      .evaluate((element) => element === window.comparisonSvg),
    true,
  )
  assert.equal(
    await page.evaluate(() =>
      window.serverCharts.every(
        ({ svg, mark }) =>
          svg.isConnected &&
          mark.isConnected &&
          svg.querySelector('.ts-chart__line path') === mark,
      ),
    ),
    true,
    'Immutable updates must preserve hydrated SVG and mark nodes',
  )
  await lifetime.getByRole('button', { name: 'Unmount both' }).click()
  await page.waitForFunction(
    () => document.querySelectorAll('svg').length === 6,
  )
  await lifetime.getByRole('button', { name: 'Remount both' }).click()
  await page.waitForFunction(
    () => document.querySelectorAll('svg').length === 8,
  )
  await page.getByRole('button', { name: 'Dark theme' }).click()
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForFunction(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )
  assert.deepEqual(errors, [])
  console.log(
    'Angular comparison passed: SSR hydration, both legacy bugs, native host styling, updates, remount, themes and mobile layout.',
  )
} finally {
  await browser.close()
  await new Promise((done) => server.close(done))
}
