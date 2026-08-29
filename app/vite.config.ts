import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const RECORDER_BUNDLE = fileURLToPath(
  new URL('../recorder/dist/recorder.global.js', import.meta.url),
)

/**
 * Serves the built recorder bundle and injects it into the page during
 * `vite dev` only. `apply: 'serve'` keeps it out of production builds, so
 * the victim app still ships with no knowledge of the recorder — the
 * recorder remains an outside observer, this just saves pasting it into the
 * console after every reload while developing against it.
 */
function recorderDevInject(): Plugin {
  return {
    name: 'recorder-dev-inject',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__recorder.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        try {
          res.end(readFileSync(RECORDER_BUNDLE, 'utf8'))
        } catch {
          res.end('console.warn("[recorder] bundle missing — run `npm run build` in /recorder");')
        }
      })
    },
    transformIndexHtml() {
      return [{ tag: 'script', attrs: { src: '/__recorder.js', defer: true }, injectTo: 'body' }]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), recorderDevInject()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
})
