import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const RECORDER_BUNDLE = fileURLToPath(
  new URL('../recorder/dist/recorder.global.js', import.meta.url),
)

const MISSING = 'console.warn("[recorder] bundle missing — run `npm run build` in /recorder");'

/**
 * Puts the recorder on the page without the app knowing about it.
 *
 * In dev it is served from memory; in a build it is copied out as a plain
 * asset. Either way it arrives as a `<script>` tag added to the HTML, and no
 * file under `app/src` imports it or refers to it. That is the point: the
 * recorder is an outside observer of this app, not a part of it, and a
 * deployed demo should not quietly turn it into a dependency.
 *
 * It used to be `apply: 'serve'` — dev only — on the reasoning that a
 * production build has no business shipping the recorder. True of a real app,
 * and wrong for this one, which exists to be recorded. A build without it is a
 * deployed URL where none of the thing being demonstrated can be tried.
 */
function recorderInject(): Plugin {
  let base = '/'
  let isDev = false

  return {
    name: 'recorder-inject',

    configResolved(config) {
      base = config.base
      isDev = config.command === 'serve'
    },

    configureServer(server) {
      server.middlewares.use('/__recorder.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        // No caching, so rebuilding the recorder and refreshing is enough.
        res.setHeader('Cache-Control', 'no-store')
        try {
          res.end(readFileSync(RECORDER_BUNDLE, 'utf8'))
        } catch {
          res.end(MISSING)
        }
      })
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'recorder.global.js',
        source: (() => {
          try {
            return readFileSync(RECORDER_BUNDLE, 'utf8')
          } catch {
            return MISSING
          }
        })(),
      })
    },

    transformIndexHtml() {
      const src = isDev ? '/__recorder.js' : `${base}recorder.global.js`
      return [{ tag: 'script', attrs: { src, defer: true }, injectTo: 'body' }]
    },
  }
}

// GitHub Pages serves a project site from a subpath, so the built asset URLs
// need that prefix. Left as "/" for dev and for the test suite, which drives
// the dev server and would otherwise have to know about the deployment.
const base = process.env.DEPLOY_BASE ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), recorderInject()],
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
})
