import { test, expect } from '@playwright/test'
import { installSyntheticMarket } from './fixtures/synthetic-market'
import './journeys.generated.spec'

test.beforeEach(async ({ page }) => installSyntheticMarket(page))

test('Income edits survive reopening their saved URL', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('app.nav.income').click()
  await page.getByTestId('income.setup.load-sample').click()
  await page.getByTestId('income.setup.total-value').fill('123456')
  await page.getByTestId('income.setup.weight-SCHD').fill('50')
  const saved = page.url()
  await page.getByTestId('app.nav.home').click()
  await page.goto(saved)
  await expect(page.getByTestId('income.setup.total-value')).toHaveValue('123456')
  await expect(page.getByTestId('income.setup.weight-SCHD')).toHaveValue('50')
})

test('Monte Carlo plan edits survive reopening their saved URL', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('app.nav.montecarlo').click()
  await page.getByTestId('montecarlo.plan.starting-balance').fill('123456')
  await page.getByTestId('montecarlo.plan.horizon').fill('17')
  const saved = page.url()
  await page.getByTestId('app.nav.home').click()
  await page.goto(saved)
  await expect(page.getByTestId('montecarlo.plan.starting-balance')).toHaveValue('123456')
  await expect(page.getByTestId('montecarlo.plan.horizon')).toHaveValue('17')
})

test('X-ray analyzed positions survive a page reload', async ({ page }) => {
  await page.goto('/xray')
  await page.getByTestId('xray.inputs.positions').fill('AAPL 12\nVTI 40')
  await page.getByTestId('xray.inputs.analyze-positions').click()
  await expect(page.getByTestId('xray.holdings.backtest-mix')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('xray.inputs.positions')).toHaveValue('AAPL 12\nVTI 40')
})

test('Voice draft needs confirmation and reports the real Handles action', async ({ page }) => {
  await page.goto('/?voice-demo')
  await page.getByTestId('dev.voice.draft').fill('open research')
  await expect(page.getByTestId('dev.voice.proposal')).toContainText('app.nav.stock')
  await expect(page).toHaveURL(/\/?\?voice-demo$/)
  await page.getByTestId('dev.voice.confirm').click()
  await expect(page).toHaveURL(/\/stock$/)
  await expect(page.getByTestId('dev.voice.receipt')).toContainText('Completed:')
  await page.getByTestId('dev.voice.draft').fill('buy shares and sign in')
  await expect(page.getByTestId('dev.voice.confirm')).toBeDisabled()
})

test('Paced replay follows Research controls and preserves its receipts', async ({ page }, testInfo) => {
  const { readFile } = await import('node:fs/promises')
  const { pathToFileURL } = await import('node:url')
  const path = await import('node:path')
  const runtimeRoot = process.env.P08_HANDLES_ROOT || path.resolve('node_modules/agent-handles')
  const { runJourney } = await import(pathToFileURL(path.join(runtimeRoot, 'src/journeys/run.mjs')).href)
  const manifest = JSON.parse(await readFile('journeys/manifest.json', 'utf8'))
  const journey = manifest.journeys.find((value: { name: string }) => value.name === 'research-ticker-drill')
  await page.goto('/')
  const receipts = await runJourney({ baseUrl: new URL(page.url()).origin, journey, paceMs: 120 })
  await testInfo.attach('paced-replay-receipts', { body: JSON.stringify(receipts, null, 2), contentType: 'application/json' })
  expect(receipts).toHaveLength(journey.steps.length)
  expect(receipts.every((receipt: { ok: boolean }) => receipt.ok)).toBe(true)
  await expect(page.getByTestId('stock.header.switch-ticker')).toContainText('AAPL')
  await page.screenshot({ path: testInfo.outputPath('paced-replay.png'), fullPage: true })
})

test('Unknown Handles targets refuse and actual unidentified controls remain observable', async ({ page }) => {
  await page.goto('/backtest')
  await expect(page.getByTestId('backtest.builder.advanced-toggle')).toBeVisible()
  const session = await page.request.post('/__agent-handles/session', { data: { paceMs: 0 } })
  expect(session.status()).toBe(201)
  const { token } = await session.json()
  const unknown = await page.request.post('/__agent-handles/command', { data: { token, command: { action: 'click', testId: 'unknown.navigation.destination', timeoutMs: 300 } } })
  const refusal = await unknown.json()
  expect(refusal.ok).toBe(false)
  expect(refusal.detail).toContain('unknown.navigation.destination')
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.textContent = 'P08 deliberately unidentified button'
    button.setAttribute('role', 'tabpanel')
    document.body.append(button)
  })
  const observed = await page.request.post('/__agent-handles/command', { data: { token, command: { action: 'observe', includeUnidentified: true } } })
  const result = await observed.json()
  expect(result.ok).toBe(true)
  const observation = JSON.parse(result.detail)
  expect(observation.unidentifiedInteractive.some((item: { text?: string }) => item.text?.includes('P08 deliberately unidentified button'))).toBe(true)
})

test('Speech result remains an editable proposal until explicit confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    class FixtureRecognition {
      continuous = false
      interimResults = false
      onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null
      onend: (() => void) | null = null
      start() {
        this.onresult?.({ results: [[{ transcript: 'open income' }]] })
        this.onend?.()
      }
      abort() { this.onend?.() }
    }
    Object.assign(window, { SpeechRecognition: FixtureRecognition })
  })
  await page.goto('/?voice-demo')
  await page.getByTestId('dev.voice.listen').click()
  await expect(page.getByTestId('dev.voice.draft')).toHaveValue('open income')
  await expect(page.getByTestId('dev.voice.proposal')).toContainText('app.nav.income')
  await expect(page).toHaveURL(/\/?\?voice-demo$/)
  await page.getByTestId('dev.voice.confirm').click()
  await expect(page).toHaveURL(/\/income$/)
  await expect(page.getByTestId('dev.voice.receipt')).toContainText('Completed:')
})
