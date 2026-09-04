import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

// Explicit synthetic acceptance suite. The normal app suite stays unchanged.
const root = fileURLToPath(new URL('..', import.meta.url))
const port = Number(process.env.PORT) || 5199
export default defineConfig({
  testDir: '.',
  testMatch: 'p08.check.ts',
  workers: 1,
  outputDir: path.resolve(root, process.env.P08_OUTPUT_DIR || '.agent-handles/p08-results'),
  use: {
    baseURL: `http://localhost:${port}`,
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    testIdAttribute: 'data-testid',
  },
  webServer: {
    cwd: root,
    command: `npm run dev -- --config tests/vite-p08.config.ts --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    stdout: 'ignore',
  },
})
