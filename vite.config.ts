import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import pkg from './package.json' with { type: 'json' }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [svelte()],
  server: {
    strictPort: true,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
