import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import fs from 'node:fs'
import pkg from './package.json' with { type: 'json' }

/** Dev-only Vite plugin: POST /api/log → tmp/log.txt */
function devLogPlugin() {
  return {
    name: 'dev-log',
    configureServer(server: { middlewares: { use: (fn: Function) => void } }) {
      server.middlewares.use((req: { method?: string; url?: string }, res: { end: (s?: string) => void }, next: () => void) => {
        if (req.method === 'POST' && req.url === '/api/log') {
          const chunks: Buffer[] = []
          ;(req as NodeJS.ReadableStream).on('data', (c: Buffer) => chunks.push(c))
          ;(req as NodeJS.ReadableStream).on('end', () => {
            fs.mkdirSync('tmp', { recursive: true })
            fs.writeFileSync('tmp/log.txt', Buffer.concat(chunks))
            res.end('ok')
          })
        } else { next() }
      })
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [svelte(), devLogPlugin()],
  server: {
    strictPort: true,
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
