/**
 * Wraps an API route handler so what it did reaches the debug log (ENG-104): one line
 * per call (method, path, status, time) and an error line when it throws (the error
 * is still thrown, so Next answers 500 as before). The path's ids are shown as :id;
 * the body, the query and the response are never read.
 */
import { log } from './logger'
import { describeError } from './redact'

/** /api/categories/abc123def456 → /api/categories/:id (a segment with a digit and 8+ characters) */
export function routeName(pathname: string): string {
  return pathname.replace(/\/[A-Za-z0-9_-]{8,}(?=\/|$)/g, seg => (/\d/.test(seg) ? '/:id' : seg))
}

export function logged<R extends Request, A extends unknown[]>(handler: (req: R, ...rest: A) => Promise<Response> | Response) {
  return async (req: R, ...rest: A): Promise<Response> => {
    const started = Date.now()
    const name = `${req.method} ${routeName(new URL(req.url).pathname)}`
    try {
      const res = await handler(req, ...rest)
      const ms = Date.now() - started
      const level = res.status >= 500 ? 'error' : res.status >= 400 ? 'warn' : 'info'
      log[level]('app', `${name} → ${res.status} · ${ms}ms`, { route: name, status: res.status, ms })
      return res
    } catch (e) {
      log.error('app', `${name} threw ${describeError(e)}`, { route: name, ms: Date.now() - started })
      throw e
    }
  }
}
