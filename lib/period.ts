/**
 * The selected period (ENG-63): a year, and a month or "all months".
 *
 * The URL (`?year=&month=`) is the source of truth and stays shareable. The
 * last period a page showed is also remembered in a cookie, so a link without
 * params (or a freshly opened app) uses it: URL params, then the cookie, then
 * the default (the current year, all months).
 *
 * Pure helpers only; lib/period-server.ts reads the cookie and the database.
 */

export const PERIOD_COOKIE = 'tazrim-period'

export interface Period {
  year: number
  /** 1-12; undefined is "all months" */
  month?: number
}

export type PeriodSource = 'url' | 'cookie' | 'default'

export interface ResolvedPeriod extends Period {
  source: PeriodSource
}

/** The period params of a page, as Next passes them or a URLSearchParams. */
export type PeriodParams =
  | { year?: string | string[]; month?: string | string[] }
  | URLSearchParams
  | null
  | undefined

function first(v: string | string[] | null | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined
}

function parseYear(v: string | undefined): number | undefined {
  if (!v || !/^\d{4}$/.test(v)) return undefined
  const y = Number(v)
  return y >= 1900 && y <= 2999 ? y : undefined
}

function parseMonth(v: string | undefined): number | undefined {
  if (!v || !/^\d{1,2}$/.test(v)) return undefined
  const m = Number(v)
  return m >= 1 && m <= 12 ? m : undefined
}

function read(params: PeriodParams, key: 'year' | 'month'): string | undefined {
  if (!params) return undefined
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined
  return first(params[key])
}

/**
 * The period the URL asks for, or null when it names none. A year without a
 * month is "all months". A month without a year (an old link) keeps the
 * month and leaves the year to the cookie / default: `year` is undefined.
 */
export function periodFromParams(params: PeriodParams): { year?: number; month?: number } | null {
  const year = parseYear(read(params, 'year'))
  const month = parseMonth(read(params, 'month'))
  if (year === undefined && month === undefined) return null
  return { year, month }
}

/** "2026" for all months, "2026-3" for one month. */
export function formatPeriodCookie(p: Period): string {
  return p.month ? `${p.year}-${p.month}` : String(p.year)
}

export function parsePeriodCookie(value: string | undefined | null): Period | null {
  if (!value) return null
  const match = /^(\d{4})(?:-(\d{1,2}))?$/.exec(decodeURIComponent(value).trim())
  if (!match) return null
  const year = parseYear(match[1])
  if (year === undefined) return null
  if (match[2] === undefined) return { year }
  const month = parseMonth(match[2])
  return month === undefined ? null : { year, month }
}

export function defaultPeriod(now: Date = new Date()): Period {
  return { year: now.getFullYear() }
}

/**
 * URL params, then the remembered cookie, then the default. A remembered
 * period whose year has no data at all falls back to the default (current
 * year, all months), so a stale cookie never opens an empty app.
 */
export async function resolvePeriod(
  params: PeriodParams,
  cookie: string | undefined | null,
  opts: { now?: Date; yearHasData?: (year: number) => boolean | Promise<boolean> } = {}
): Promise<ResolvedPeriod> {
  const fallback = defaultPeriod(opts.now)
  const url = periodFromParams(params)
  const remembered = parsePeriodCookie(cookie)

  if (url?.year !== undefined) return { year: url.year, month: url.month, source: 'url' }
  if (url?.month !== undefined) {
    return { year: remembered?.year ?? fallback.year, month: url.month, source: 'url' }
  }
  if (remembered) {
    if (remembered.year === fallback.year || !opts.yearHasData || (await opts.yearHasData(remembered.year))) {
      return { ...remembered, source: 'cookie' }
    }
  }
  return { ...fallback, source: 'default' }
}

/** `{ year, month? }` as query params (month left out for all months). */
export function periodQuery(p: Period): { year: string; month?: string } {
  return p.month ? { year: String(p.year), month: String(p.month) } : { year: String(p.year) }
}

export function samePeriod(a: Period | null | undefined, b: Period | null | undefined): boolean {
  return !!a && !!b && a.year === b.year && (a.month ?? 0) === (b.month ?? 0)
}

/** Pages that show a period: the overview, /banks* and /cards*. */
export function isPeriodPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/banks' ||
    pathname.startsWith('/banks/') ||
    pathname === '/cards' ||
    pathname.startsWith('/cards/')
  )
}

/**
 * `href` with the period added, when it points at a period page and does not
 * name a period already (a link to a specific month keeps it). Other params
 * and the hash are kept; other pages' links are returned as they are.
 */
export function withPeriod(href: string, period: Period): string {
  const hashAt = href.indexOf('#')
  const hash = hashAt >= 0 ? href.slice(hashAt) : ''
  const base = hashAt >= 0 ? href.slice(0, hashAt) : href
  const qAt = base.indexOf('?')
  const path = qAt >= 0 ? base.slice(0, qAt) : base
  if (!isPeriodPath(path)) return href
  const sp = new URLSearchParams(qAt >= 0 ? base.slice(qAt + 1) : '')
  if (sp.has('year') || sp.has('month')) return href
  const q = periodQuery(period)
  // year and month first, so the URLs read the same everywhere
  const out = new URLSearchParams({ ...q })
  for (const [k, v] of sp) out.append(k, v)
  return `${path}?${out.toString()}${hash}`
}

/**
 * The period one step back (-1) or forward (+1): a month, crossing into the
 * previous or next year at the ends, or a whole year when all months are shown.
 */
export function stepPeriod(period: Period, delta: -1 | 1): Period {
  if (!period.month) return { year: period.year + delta }
  const index = period.year * 12 + (period.month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}
