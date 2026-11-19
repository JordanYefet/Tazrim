/**
 * Page requests in the debug log (ENG-104): every document load and every navigation
 * (Next's RSC fetch, which is what a month switch is) as one line,
 * `GET /bank?year=2026&month=3 → 200 · 84ms`, with the real status and time. API calls
 * are logged by their own routes (lib/log/route.ts); /_next, files, prefetches and the
 * log pages are left out.
 *
 * instrumentation.ts calls installPageLog() once. It watches the Node http server's
 * 'request' event and notes the response's status when it finishes, so no request
 * stream is touched. A page request's line carries data.page ("GET /bank?year=2026&month=3"),
 * which makes it the start of a group in the grouped view (lib/log/view.ts).
 */
import http from 'node:http'
import { log } from './logger'
import { redact, redactData } from './redact'

const INSTALLED = Symbol.for('tazrim.log.pageHook')

export interface PageRequest {
  /** What the group is called: "GET /bank?year=2026&month=3" */
  page: string
  kind: 'page' | 'rsc'
  query?: Record<string, string>
}

/** Null for a request that is not a page: static files, /_next, the API, the log pages, prefetches */
export function describePageRequest(method: string | undefined, rawUrl: string | undefined, headers: Record<string, unknown> = {}): PageRequest | null {
  if (method !== 'GET') return null
  let url: URL
  try {
    url = new URL(rawUrl ?? '/', 'http://local')
  } catch {
    return null
  }
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') : url.pathname
  if (path.startsWith('/_next') || path.startsWith('/__') || path === '/api' || path.startsWith('/api/')) return null
  if (path === '/logs' || path.startsWith('/logs/')) return null
  if (/\.[A-Za-z0-9]+$/.test(path)) return null // favicon.ico, a font, an image, a manifest
  if (headers['next-router-prefetch'] || headers['purpose'] === 'prefetch') return null
  const rsc = url.searchParams.has('_rsc') || headers['rsc'] === '1'
  url.searchParams.delete('_rsc')
  const query = Object.fromEntries(url.searchParams)
  const qs = [...url.searchParams].map(([k, v]) => `${k}=${redact(v)}`).join('&')
  return {
    page: `GET ${path}${qs ? `?${qs}` : ''}`,
    kind: rsc ? 'rsc' : 'page',
    ...(Object.keys(query).length ? { query } : {}),
  }
}

export function logPageRequest(p: PageRequest, status: number, ms: number, aborted = false) {
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'
  log[level]('app', `${p.page} → ${status} · ${ms}ms`, {
    page: p.page,
    kind: p.kind,
    status,
    ms,
    ...(p.query ? { query: redactData(p.query) } : {}),
    ...(aborted ? { aborted: true } : {}),
  })
}

/** Patches http.Server.prototype.emit once per process; safe to call again */
export function installPageLog() {
  const proto = http.Server.prototype as unknown as Record<symbol, unknown> & { emit: (...a: unknown[]) => boolean }
  if (proto[INSTALLED]) return
  proto[INSTALLED] = true
  const original = proto.emit
  proto.emit = function (this: unknown, event: unknown, ...args: unknown[]) {
    if (event === 'request') {
      try {
        const [req, res] = args as [http.IncomingMessage, http.ServerResponse]
        const page = describePageRequest(req.method, req.url, req.headers as Record<string, unknown>)
        if (page) {
          const started = Date.now()
          let done = false
          const end = (aborted: boolean) => {
            if (done) return
            done = true
            try {
              logPageRequest(page, res.statusCode, Date.now() - started, aborted)
            } catch {}
          }
          res.once('finish', () => end(false))
          res.once('close', () => end(true))
        }
      } catch {
        // Logging never gets in the way of a request
      }
    }
    return original.call(this, event, ...args)
  }
}
