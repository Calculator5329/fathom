/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// @ts-expect-error agent-handles ships untyped .mjs
import agentHandles from 'agent-handles/vite'

export default defineConfig({
  plugins: [react(), tailwindcss(), agentHandles()],
  // Playwright owns tests/ (generated journey specs); vitest owns src/.
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
