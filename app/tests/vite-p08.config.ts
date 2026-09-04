import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { defineConfig } from 'vite'
import base from '../vite.config'

// Test-only override for a reviewed local Handles worktree. Production still uses
// the application's installed dependency. No dependency or Vite source is patched.
export default defineConfig(async () => {
  const root = process.cwd()
  const override = process.env.P08_HANDLES_ROOT
  const handles = override ? (await import(pathToFileURL(path.join(override, 'src/vite/index.mjs')).href)).default() : null
  return {
    ...base,
    root,
    plugins: handles ? [...(base.plugins ?? []).filter(plugin => !plugin || !('name' in plugin) || plugin.name !== 'agent-handles'), handles] : base.plugins,
    server: {
      ...base.server,
      fs: { allow: [root, fs.realpathSync(path.join(root, 'node_modules'))] },
      watch: { ignored: ['**/.agent-handles/**'] },
    },
  }
})
