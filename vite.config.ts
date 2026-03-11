import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  plugins: [svelte()],
  server: {
    strictPort: true,
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
