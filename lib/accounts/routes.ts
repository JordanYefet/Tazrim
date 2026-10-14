import type { AccountKind } from '@prisma/client'

/** Page search params as Next passes them, or a URLSearchParams. */
export type QueryInput = Record<string, string | string[] | undefined> | URLSearchParams | undefined

/** Account kinds that have pages (trading and pension accounts don't yet). */
export type PagedAccountKind = Extract<AccountKind, 'BANK' | 'CREDIT_CARD'>

const BASE: Record<PagedAccountKind, string> = {
  BANK: '/banks',
  CREDIT_CARD: '/cards',
}

/** Every param (repeated keys included) as a query string, without the "?". */
export function toQueryString(params: QueryInput): string {
  if (!params) return ''
  if (params instanceof URLSearchParams) return params.toString()
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) sp.append(key, v)
  }
  return sp.toString()
}

export function withQuery(path: string, params: QueryInput): string {
  const qs = toQueryString(params)
  return qs ? `${path}?${qs}` : path
}

/** `/banks` or `/cards` for the overview, `/banks/<id>` or `/cards/<id>` for one account. */
export function accountPath(kind: PagedAccountKind, accountId?: string): string {
  return accountId ? `${BASE[kind]}/${encodeURIComponent(accountId)}` : BASE[kind]
}

export function accountHref(kind: PagedAccountKind, accountId: string | undefined, params?: QueryInput): string {
  return withQuery(accountPath(kind, accountId), params)
}

/**
 * Where an old single-account URL (/bank, /cards/max) goes now: the default
 * account's page, or the overview when there is none. Every param is kept.
 */
export function legacyAccountRedirect(
  kind: PagedAccountKind,
  defaultAccountId: string | null | undefined,
  params: QueryInput
): string {
  return accountHref(kind, defaultAccountId ?? undefined, params)
}

/**
 * The account management section of /settings (it used to be /accounts).
 * Every param is kept, so `/accounts?new=card` still opens the add form.
 */
export function settingsAccountsHref(params: QueryInput): string {
  return `${withQuery('/settings', params)}#accounts`
}

/** Whether a nav item is the current section: "/" exactly, others with their sub-pages. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
