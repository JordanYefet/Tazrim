/**
 * Wraps an API route handler so what it did reaches the debug log (ENG-104): one line
 * per call, `POST /api/categories → 201 · 31ms`, with the request's query and payload
 * and, for an error, the response, in the line's details. A thrown error is logged and
 * thrown again (Next answers 500 as before). The path's ids are shown as :id.
 *
 * What is read, and how:
 *  - the body comes from req.clone() before the handler runs, so the handler still has
 *    its own untouched; JSON is redacted and capped, a form shows field names and, for a
 *    file, its name, type and size, never its contents; anything else is its type and size;
 *  - the response is read (from res.clone()) only for status 400 and up with a JSON body,
 *    to show the error; a success and anything streaming is never read;
 *  - on the sensitive routes (SENSITIVE below: sign-in, the vault, passwords, passkeys,
 *    deleting everything) only the body's keys are kept, every value is masked;
 *  - the log never throws into a request: any failure here is swallowed.
 */
import { log } from './logger'
import { MASK, describeError, redact, redactData } from './redact'

/** /api/categories/abc123def456 → /api/categories/:id (a segment with a digit and 8+ characters) */
export function routeName(pathname: string): string {
  return pathname.replace(/\/[A-Za-z0-9_-]{8,}(?=\/|$)/g, seg => (/\d/.test(seg) ? '/:id' : seg))
}

/** Routes that carry logins, passwords or passkey answers: the body is logged as keys only */
const SENSITIVE = /^\/api\/(?:auth|vault)(?:\/|$)|^\/api\/people\/(?:password|recovery|passkeys)(?:\/|$)|^\/api\/data\/delete-all(?:\/|$)/
export const isSensitiveRoute = (pathname: string) => SENSITIVE.test(pathname)

/** The longest a body or an error response is kept, serialised */
export const CAPTURE_MAX = 4096
/** A body larger than this (by its Content-Length) is not read at all */
const READ_MAX = 256 * 1024
const MULTIPART_MAX = 20 * 1024 * 1024

/** The same shape with every value replaced by MASK: the keys stay, nothing else */
export function maskValues(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return depth >= 6 ? MASK : value.slice(0, 20).map(v => maskValues(v, depth + 1))
  if (value && typeof value === 'object') {
    if (depth >= 6) return MASK
    return Object.fromEntries(Object.keys(value).slice(0, 50).map(k => [k, maskValues((value as Record<string, unknown>)[k], depth + 1)]))
  }
  return MASK
}

/** A value kept whole, or, over CAPTURE_MAX serialised, a marker with the start of it */
export function capped(value: unknown): unknown {
  const text = JSON.stringify(value)
  if (text === undefined || text.length <= CAPTURE_MAX) return value
  return { truncated: true, size: text.length, preview: `${text.slice(0, 400)}…` }
}

const isForm = (type: string) => type.includes('multipart/form-data')

async function readBody(req: Request, sensitive: boolean): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD' || !req.body) return undefined
  const type = req.headers.get('content-type') ?? ''
  const length = Number(req.headers.get('content-length')) || 0
  const clone = req.clone()
  const finish = (v: unknown) => (sensitive ? maskValues(v) : capped(redactData(v)))

  if (isForm(type)) {
    if (length > MULTIPART_MAX) return { contentType: type.split(';')[0], bytes: length }
    const form = await clone.formData()
    const out: Record<string, unknown> = {}
    for (const [k, v] of form.entries()) {
      out[k] = typeof v === 'string' ? v : sensitive ? MASK : { file: v.name, type: v.type, size: v.size }
    }
    return Object.keys(out).length ? finish(out) : undefined
  }
  if (length > READ_MAX) return { contentType: type.split(';')[0], bytes: length }
  const text = await clone.text()
  if (!text) return undefined
  if (type.includes('json')) {
    try {
      return finish(JSON.parse(text))
    } catch {
      return { contentType: type.split(';')[0], bytes: text.length, invalidJson: true }
    }
  }
  if (type.includes('application/x-www-form-urlencoded')) return finish(Object.fromEntries(new URLSearchParams(text)))
  return { contentType: type.split(';')[0] || 'unknown', bytes: new TextEncoder().encode(text).length }
}

async function readError(res: Response): Promise<unknown> {
  if (res.status < 400 || !(res.headers.get('content-type') ?? '').includes('json')) return undefined
  const text = await res.clone().text()
  if (!text) return undefined
  try {
    return capped(redactData(JSON.parse(text)))
  } catch {
    return undefined
  }
}

/** The path as shown: ids as :id, query values redacted (masked entirely on a sensitive route) */
export function displayPath(url: URL, sensitive = false): string {
  const params = [...url.searchParams.entries()].map(([k, v]) => `${k}=${sensitive ? MASK : redact(v)}`)
  return routeName(url.pathname) + (params.length ? `?${params.join('&')}` : '')
}

const levelOf = (status: number) => (status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logged<H extends (...args: any[]) => Promise<Response> | Response>(handler: H): H {
  const wrapped = async (req: Request, ...rest: unknown[]): Promise<Response> => {
    // Called with no request (a test calling GET()): nothing to describe
    if (!req || typeof req.url !== 'string') return handler(req, ...rest)
    const started = Date.now()
    let url: URL | null = null
    let sensitive = false
    let query: unknown
    let body: unknown
    let shown = `${req.method} ${req.url}`
    try {
      url = new URL(req.url)
      sensitive = isSensitiveRoute(url.pathname)
      shown = `${req.method} ${displayPath(url, sensitive)}`
      if ([...url.searchParams].length) query = sensitive ? maskValues(Object.fromEntries(url.searchParams)) : redactData(Object.fromEntries(url.searchParams))
      body = await readBody(req, sensitive)
    } catch {
      // Not being able to read it must not touch the request
    }
    const route = url ? `${req.method} ${routeName(url.pathname)}` : shown
    const fields = (status: number | undefined, response?: unknown) => ({
      route,
      ...(status !== undefined ? { status } : {}),
      ms: Date.now() - started,
      ...(query !== undefined ? { query } : {}),
      ...(body !== undefined ? { body } : {}),
      ...(response !== undefined ? { response } : {}),
    })

    let res: Response
    try {
      res = await handler(req, ...rest)
    } catch (e) {
      try {
        log.error('app', `${shown} threw ${describeError(e)}`, { ...fields(500), error: describeError(e) })
      } catch {}
      throw e
    }
    try {
      const response = await readError(res).catch(() => undefined)
      const f = fields(res.status, response)
      log[levelOf(res.status)]('app', `${shown} → ${res.status} · ${f.ms}ms`, f)
    } catch {}
    return res
  }
  return wrapped as unknown as H
}
