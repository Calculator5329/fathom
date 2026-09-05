import { test, expect, type Page, type Route } from '@playwright/test'

async function mount(page: Page) {
  await page.route('https://**', route => route.abort())
  await page.goto('/styleguide')
  await page.evaluate(async () => {
    const modulePath = '/tests/simulationProbe.ts'
    const { mountSimulationProbe } = await import(modulePath)
    Object.assign(window, { simulationProbe: mountSimulationProbe() })
  })
  await expect(page.locator('#simulation-output')).toBeVisible()
}
async function output(page: Page) { return JSON.parse(await page.locator('#simulation-output').innerText()) }
async function requests(page: Page) { return page.evaluate('window.simulationProbe.workers().reduce((sum, worker) => sum + worker.requests, 0)') }

test('obsolete simulation cannot overwrite current results or end current work', async ({ page }) => {
  await mount(page)
  await expect.poll(() => requests(page)).toBe(1)
  await page.evaluate('window.simulationProbe.respond(0, 1)')
  await expect.poll(async () => (await output(page)).maxSwr).toBe(1)
  await page.evaluate('window.simulationProbe.change({ trials: 3 })')
  await expect.poll(async () => (await output(page)).running).toBe(true)
  await page.evaluate('window.simulationProbe.respond(0, 99)')
  expect((await output(page)).maxSwr).toBe(1)
  expect((await output(page)).running).toBe(true)
  await expect.poll(() => requests(page)).toBe(2)
  await page.evaluate('window.simulationProbe.respond(1, 2)')
  await expect.poll(async () => (await output(page)).maxSwr).toBe(2)
  await page.evaluate('window.simulationProbe.respond(0, 99)')
  expect((await output(page)).maxSwr).toBe(2)
  expect(await page.evaluate('window.simulationProbe.workers()[0].terminated')).toBe(true)
})

test('invalid configuration preserves visibly stale results and cancels old work', async ({ page }) => {
  await mount(page)
  await expect.poll(() => requests(page)).toBe(1)
  await page.evaluate('window.simulationProbe.respond(0, 1)')
  await expect.poll(async () => (await output(page)).result).toBe(true)
  await page.evaluate('window.simulationProbe.change({ allocation: [] })')
  await expect.poll(async () => (await output(page)).running).toBe(false)
  expect((await output(page)).stale).toBe(true)
  await page.evaluate('window.simulationProbe.respond(0, 99)')
  expect((await output(page)).maxSwr).toBe(1)
  expect(await page.evaluate('window.simulationProbe.workers()[0].terminated')).toBe(true)
})

test('worker failure stops running, preserves the last result and recovers after an edit', async ({ page }) => {
  await mount(page)
  await expect.poll(() => requests(page)).toBe(1)
  await page.evaluate('window.simulationProbe.respond(0, 1)')
  await expect.poll(async () => (await output(page)).result).toBe(true)
  await page.evaluate('window.simulationProbe.change({ trials: 3 })')
  await expect.poll(() => requests(page)).toBe(2)
  await page.evaluate('window.simulationProbe.fail(1)')
  await expect.poll(async () => (await output(page)).running).toBe(false)
  expect((await output(page)).error).toBeTruthy()
  expect((await output(page)).maxSwr).toBe(1)
  expect((await output(page)).stale).toBe(true)
  await page.evaluate('window.simulationProbe.change({ trials: 4 })')
  await expect.poll(() => requests(page)).toBe(3)
  await page.evaluate('window.simulationProbe.respond(2, 2)')
  await expect.poll(async () => (await output(page)).stale).toBe(false)
  expect((await output(page)).error).toBe(null)
})

test('asset-load rejection stops running without posting work', async ({ page }) => {
  await page.route('**/data/asset-classes/*.json', route => route.fulfill({ status: 404, body: '{}' }))
  await mount(page)
  await expect.poll(() => requests(page)).toBe(1)
  await page.evaluate('window.simulationProbe.change({ mode: "historical" })')
  await expect.poll(async () => (await output(page)).running).toBe(false)
  expect((await output(page)).error).toBeTruthy()
  expect(await requests(page)).toBe(1)
})

test('unmount terminates computation and debounce avoids workers for rapid edits', async ({ page }) => {
  await page.clock.install()
  await mount(page)
  await page.evaluate('window.simulationProbe.change({ trials: 3 }); window.simulationProbe.change({ trials: 4 })')
  expect(await page.evaluate('window.simulationProbe.workers().length')).toBe(0)
  await page.clock.runFor(151)
  await expect.poll(() => requests(page)).toBe(1)
  await page.evaluate('window.simulationProbe.unmount()')
  expect(await page.evaluate('window.simulationProbe.workers().every(worker => worker.terminated)')).toBe(true)
})

const syntheticData = { dates: ['2000-01'], series: {
  usStocks: [0.01], usBonds: [0.01], cash: [0.01], cpi: [100],
  smallCap: [0.01], midCap: [0.01], largeCap: [0.01],
} }

test('obsolete pending data loads cannot post work or clear current running state', async ({ page }) => {
  const pending: Route[] = []
  await page.route('**/data/asset-classes/*.json', route => { pending.push(route) })
  await mount(page)
  await expect.poll(() => requests(page)).toBe(1)
  await page.evaluate('window.simulationProbe.change({ mode: "historical" })')
  await expect.poll(() => pending.length).toBe(2)
  await page.evaluate('window.simulationProbe.change({ mode: "parametric", trials: 9 })')
  await expect.poll(() => requests(page)).toBe(2)
  await Promise.all(pending.map(route => route.fulfill({ json: syntheticData })))
  // Await the same cached load as the obsolete job, then the next frame.
  await page.evaluate(async () => {
    const path = '/src/data/assetClasses.ts'
    const { loadAssetClassData } = await import(path)
    await loadAssetClassData()
    await new Promise(requestAnimationFrame)
  })
  expect(await requests(page)).toBe(2)
  expect((await output(page)).running).toBe(true)
  await page.evaluate('window.simulationProbe.respond(1, 2)')
  await expect.poll(async () => (await output(page)).maxSwr).toBe(2)
})

test('real results panel remains visible and clearly stale after worker failure', async ({ page }) => {
  await page.route('https://**', route => route.abort())
  await page.route('**/data/asset-classes/*.json', route => route.fulfill({ json: syntheticData }))
  await page.goto('/styleguide')
  await page.evaluate(async () => {
    const path = '/tests/simulationProbe.ts'
    const { mountSimulationProbe } = await import(path)
    Object.assign(window, { simulationProbe: mountSimulationProbe('page') })
  })
  await expect.poll(() => requests(page)).toBe(1)
  await page.evaluate('window.simulationProbe.respond(0, 0.04)')
  const panel = page.locator('#simulation-probe main')
  await expect(panel.getByText('Success rate', { exact: true })).toBeVisible()
  await page.evaluate('window.simulationProbe.changeSearch("mode=parametric&yrs=1&trials=2000")')
  await expect.poll(() => requests(page)).toBe(2)
  await page.evaluate('window.simulationProbe.fail(1)')
  await expect(panel.getByRole('alert')).toContainText('Simulation could not finish')
  await expect(panel.getByText('Success rate', { exact: true })).toBeVisible()
  await expect(panel.getByText('Showing results from previous inputs.', { exact: true })).toBeVisible()
  await expect(panel).toHaveClass(/opacity-60/)
  await expect(panel.getByRole('alert')).toHaveCSS('font-size', '15px')
  await expect(panel.getByText('Showing results from previous inputs.', { exact: true })).toHaveCSS('font-size', '15px')
})
