import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
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
