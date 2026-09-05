/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import agentHandles from 'agent-handles/vite'
import fs from 'node:fs'
import type { Plugin } from 'vite'

// Dev data. The app reads `${BASE_URL}data/...`; production serves it from
// the GCS bucket, dev has nothing under public/data, so every loader used to
// get the SPA index page (200, text/html) back for a .json request and fail
// on JSON.parse. Serve the committed asset-class series from ../data and
// proxy everything else (tickers, catalog) to the public bucket.
const DATA_BUCKET = 'https://storage.googleapis.com/ethan-488900-fathom-data'
function devData(): Plugin {
  const local = path.resolve(__dirname, '../data')
  return {
    name: 'fathom-dev-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0])
        const file = path.join(local, rel)
        if (!file.startsWith(local) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next()
        res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream')
        res.setHeader('cache-control', 'no-cache')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), agentHandles(), devData()],
  // Playwright owns tests/ (generated journey specs); vitest owns src/.
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    proxy: {
      '/data': { target: DATA_BUCKET, changeOrigin: true, rewrite: (p) => p.replace(/^\/data/, '') },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
