/**
 * Global transaction search (ENG-42): the pure half. Parsing of the URL /
 * API params, the Prisma `where` builders for both transaction tables, the
 * cursor, result ordering, match highlighting and the link to a result.
 * No DB access here (see lib/db/search.ts), so it is safe to import from
 * client components.
 */
import type { Prisma } from '@prisma/client'
import { accountHref } from '@/lib/accounts/routes'

/** An exact amount matches anything within ±this (half an agora). */
export const AMOUNT_EPSILON = 0.005
export const DEFAULT_LIMIT = 30
export const MAX_LIMIT = 100
const MAX_TERMS = 8

export type SearchSource = 'bank' | 'card'
export type TextMode = 'all' | 'any'

/**
 * One search hit, from either table.
 *
 * `amount` is signed from the user's point of view: POSITIVE = money out
 * (bank debit, card charge), NEGATIVE = money in (bank credit, card refund).
 * `date` is the local calendar day (YYYY-MM-DD) so server and browser render
 * the same text; `dateMs` is the stored timestamp, used for ordering/cursors.
 */
export interface SearchResult {
  id: string
  source: SearchSource
  accountId: string
  accountName: string
  date: string
  dateMs: number
  /** Bank description / card merchant name, as shown in the account tables (alias already applied) */
  description: string
  /** The raw name from the statement, only when it differs from `description` */
  originalDescription?: string
  amount: number
  /** Card rows: the override when set, else the statement category. Bank rows: theirs, when set */
  category?: string
  note?: string
  /** The issuer's or bank's transaction id (voucher number / אסמכתא), when the file had one */
  reference?: string
  ignored: boolean
  /** Name of the manual recurring series that holds the row (ENG-71), computed per read */
  recurringLabel?: string
}

export interface SearchPage {
  results: SearchResult[]
  /** Pass back as `cursor` for the next page; null on the last page */
  nextCursor: string | null
  /** Rows matching the filters across both tables (ignores the cursor) */
  total: number
}

export interface AmountRange {
  min?: number
  max?: number
}

export interface SearchCursor {
  dateMs: number
  source: SearchSource
  id: string
}

export interface SearchFilters {
  /** Free text: whitespace-separated terms or "quoted phrases", each matched in any text field */
  text?: string
  /** 'all' (default): every term must match; 'any': one is enough */
  textMode?: TextMode
  amount?: AmountRange
  /** The raw amount input, kept so the form can show it back */
  amountInput?: string
  amountInvalid?: boolean
  /** Inclusive local days, YYYY-MM-DD */
  from?: string
  to?: string
  accountIds?: string[]
  categories?: string[]
  /** Only rows without a category: bank rows with none (not the card payment), card rows outside your categories */
  uncategorized?: boolean
  includeIgnored: boolean
  cursor?: SearchCursor
  limit: number
}

/** What the uncategorized filter needs from the database (lib/db/uncategorized.ts) */
export interface UncategorizedContext {
  /** Your category names: a card row with none of them is uncategorized */
  categories: string[]
  /** The bank's card-payment rows (found by a pattern a where can't express) */
  cardPaymentIds: string[]
}

/** A TransactionAlias whose display name matched a term: rows with this original name match too. */
export interface AliasMatch {
  provider: string
  originalName: string
}

// ---------------------------------------------------------------------------
// Amount parsing

const CURRENCY = /₪|ש"ח|ש״ח|ils|nis/gi

/**
 * "120", "120.5", "₪120", "1,200", "1,200.75 ש"ח" -> number. Commas are only
 * thousands separators (groups of three); a leading minus is dropped because
 * amounts are matched by magnitude. Null when it is not a number.
 */
export function parseAmount(input: string): number | null {
  const s = input.replace(CURRENCY, '').replace(/[\s ‎‏]/g, '').replace(/^-/, '')
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) return null
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * One amount box: "120" (exact, ±AMOUNT_EPSILON), "100-200" (either order),
 * "100-" / ">100" (at least), "<200" (at most). Null when unreadable.
 */
export function parseAmountRange(input: string): AmountRange | null {
  const s = input.trim()
  if (!s) return null
  const cmp = /^([<>])=?\s*(.+)$/.exec(s)
  if (cmp) {
    const n = parseAmount(cmp[2])
    if (n === null) return null
    return cmp[1] === '>' ? { min: n } : { max: n }
  }
  const range = /^(.*\d.*?)\s*[-–—]\s*(.*)$/.exec(s)
  if (range && !/^-/.test(s.replace(CURRENCY, '').trim())) {
    const a = parseAmount(range[1])
    if (a === null) return null
    if (range[2].trim() === '') return { min: a }
    const b = parseAmount(range[2])
    if (b === null) return null
    return { min: Math.min(a, b), max: Math.max(a, b) }
  }
  const n = parseAmount(s)
  if (n === null) return null
  return { min: n - AMOUNT_EPSILON, max: n + AMOUNT_EPSILON }
}

/**
 * Whitespace-separated terms, de-duplicated case-insensitively, at most 8.
 * A term in double quotes ("cheque deposit") is one phrase, spaces and all; a
 * quote inside a word (Hebrew abbreviations like בע"מ) is part of the word.
 * `%` and `_` also split terms: Prisma's SQLite `contains` does not escape
 * LIKE wildcards, so "100%" searches for "100" rather than for anything.
 */
export function splitTerms(text: string | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of (text ?? '').match(/"[^"]+"(?=\s|$)|\S+/g) ?? []) {
    const phrase = /^".+"$/.test(token)
    const body = phrase ? token.slice(1, -1).trim().replace(/\s+/g, ' ') : token.replace(/^"+|"+$/g, '')
    for (const t of body.split(/[%_]+/)) {
      const term = t.trim()
      const key = term.toLowerCase()
      if (!term || seen.has(key)) continue
      seen.add(key)
      out.push(term)
      if (out.length === MAX_TERMS) return out
    }
  }
  return out
}

/**
 * When the whole text box is one amount ("120", "₪1,200"), it is searched as
 * an amount too (text OR amount), so the quick search finds "that ₪120 charge".
 */
export function textAsAmount(text: string | undefined): AmountRange | null {
  const t = (text ?? '').trim()
  if (!t || /\s/.test(t.replace(CURRENCY, '').trim()) || !/\d/.test(t)) return null
  const n = parseAmount(t)
  return n === null ? null : { min: n - AMOUNT_EPSILON, max: n + AMOUNT_EPSILON }
}

// ---------------------------------------------------------------------------
// Params

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>

function getAll(sp: ParamSource, key: string): string[] {
  if (sp instanceof URLSearchParams) return sp.getAll(key)
  const v = sp[key]
  return v === undefined ? [] : Array.isArray(v) ? v : [v]
}
const getOne = (sp: ParamSource, key: string) => getAll(sp, key)[0]

function validDay(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? v : undefined
}

/**
 * Filters from /search or /api/search params:
 * q, match=any (one term is enough), amount (exact or range, see parseAmountRange), min, max, from, to
 * (YYYY-MM-DD), account (repeatable), category (repeatable), uncategorized=1, ignored=1,
 * cursor, limit.
 */
export function parseSearchParams(sp: ParamSource): SearchFilters {
  const filters: SearchFilters = { includeIgnored: false, limit: DEFAULT_LIMIT }

  const text = getOne(sp, 'q')?.trim()
  if (text) filters.text = text
  if (getOne(sp, 'match') === 'any') filters.textMode = 'any'

  const amountInput = getOne(sp, 'amount')?.trim()
  if (amountInput) {
    filters.amountInput = amountInput
    const r = parseAmountRange(amountInput)
    if (r) filters.amount = r
    else filters.amountInvalid = true
  } else {
    const min = getOne(sp, 'min') ? parseAmount(getOne(sp, 'min')!) : null
    const max = getOne(sp, 'max') ? parseAmount(getOne(sp, 'max')!) : null
    if (min !== null || max !== null) {
      filters.amount = {
        ...(min !== null ? { min } : {}),
        ...(max !== null ? { max } : {}),
      }
    }
  }

  const from = validDay(getOne(sp, 'from'))
  const to = validDay(getOne(sp, 'to'))
  if (from) filters.from = from
  if (to) filters.to = to

  const accounts = getAll(sp, 'account').filter(Boolean)
  if (accounts.length) filters.accountIds = accounts
  const categories = getAll(sp, 'category').filter(Boolean)
  if (categories.length) filters.categories = categories

  const uncategorized = getOne(sp, 'uncategorized')
  if (uncategorized === '1' || uncategorized === 'true') filters.uncategorized = true

  const ignored = getOne(sp, 'ignored')
  filters.includeIgnored = ignored === '1' || ignored === 'true'

  const cursor = getOne(sp, 'cursor')
  const decoded = cursor ? decodeCursor(cursor) : null
  if (decoded) filters.cursor = decoded

  const limit = Number(getOne(sp, 'limit'))
  if (Number.isFinite(limit) && limit > 0) filters.limit = Math.min(Math.floor(limit), MAX_LIMIT)

  return filters
}

/** The params for these filters (no cursor/limit unless asked), for links and API calls. */
export function toSearchParams(
  f: Partial<SearchFilters>,
  opts: { cursor?: string | null; limit?: number } = {}
): URLSearchParams {
  const sp = new URLSearchParams()
  if (f.text) sp.set('q', f.text)
  if (f.text && f.textMode === 'any') sp.set('match', 'any')
  if (f.amountInput) sp.set('amount', f.amountInput)
  else if (f.amount) {
    if (f.amount.min !== undefined) sp.set('min', String(f.amount.min))
    if (f.amount.max !== undefined) sp.set('max', String(f.amount.max))
  }
  if (f.from) sp.set('from', f.from)
  if (f.to) sp.set('to', f.to)
  for (const a of f.accountIds ?? []) sp.append('account', a)
  for (const c of f.categories ?? []) sp.append('category', c)
  if (f.uncategorized) sp.set('uncategorized', '1')
  if (f.includeIgnored) sp.set('ignored', '1')
  if (opts.cursor) sp.set('cursor', opts.cursor)
  if (opts.limit) sp.set('limit', String(opts.limit))
  return sp
}

/** False when nothing would narrow the search: then we show the empty state instead of every row. */
export function hasCriteria(f: SearchFilters): boolean {
  return Boolean(
    splitTerms(f.text).length || f.amount || f.amountInvalid || f.from || f.to || f.accountIds?.length || f.categories?.length || f.uncategorized
  )
}

// ---------------------------------------------------------------------------
// Cursor and ordering

/**
 * Order: newest first; on the same timestamp bank rows before card rows; then
 * id descending. The cursor is the last row shown, "<ms>.<source>.<id>".
 */
export function encodeCursor(c: SearchCursor): string {
  return `${c.dateMs}.${c.source}.${c.id}`
}

export function decodeCursor(s: string): SearchCursor | null {
  const m = /^(\d+)\.(bank|card)\.(.+)$/.exec(s)
  return m ? { dateMs: Number(m[1]), source: m[2] as SearchSource, id: m[3] } : null
}

const SOURCE_RANK: Record<SearchSource, number> = { bank: 0, card: 1 }

export function compareResults(a: SearchResult, b: SearchResult): number {
  if (a.dateMs !== b.dateMs) return b.dateMs - a.dateMs
  if (a.source !== b.source) return SOURCE_RANK[a.source] - SOURCE_RANK[b.source]
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** Keyset condition: rows of `source` that sort after the cursor. */
function afterCursor<D extends string>(dateField: D, source: SearchSource, c: SearchCursor) {
  const d = new Date(c.dateMs)
  if (source === c.source) {
    return { OR: [{ [dateField]: { lt: d } }, { [dateField]: d, id: { lt: c.id } }] }
  }
  // Same-day rows of a source ranked after the cursor's are all still to come
  return SOURCE_RANK[source] > SOURCE_RANK[c.source] ? { [dateField]: { lte: d } } : { [dateField]: { lt: d } }
}

// ---------------------------------------------------------------------------
// Where builders

function dayRange(f: SearchFilters): { gte?: Date; lt?: Date } | null {
  if (!f.from && !f.to) return null
  const day = (s: string, plus = 0) => {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, m - 1, d + plus)
  }
  return { ...(f.from ? { gte: day(f.from) } : {}), ...(f.to ? { lt: day(f.to, 1) } : {}) }
}

function bounds(r: AmountRange) {
  return { ...(r.min !== undefined ? { gte: r.min } : {}), ...(r.max !== undefined ? { lte: r.max } : {}) }
}

/** The same range mirrored to negatives, for card refunds. */
function negBounds(r: AmountRange) {
  return { ...(r.max !== undefined ? { gte: -r.max } : {}), ...(r.min !== undefined ? { lte: -r.min } : {}) }
}

function aliasConditions(matches: AliasMatch[] | undefined, field: string) {
  const byProvider = new Map<string, string[]>()
  for (const m of matches ?? []) {
    byProvider.set(m.provider, [...(byProvider.get(m.provider) ?? []), m.originalName])
  }
  return [...byProvider].map(([provider, names]) => ({ [field]: { in: names }, account: { provider } }))
}

/**
 * Text matching uses Prisma `contains`, which on SQLite is LIKE: ASCII letters
 * match case-insensitively, Hebrew has no case, and non-ASCII Latin (é/É) is
 * matched as typed. Alias display names are matched in JS (fully
 * case-insensitive) and passed in as `aliasMatches`, aligned with splitTerms().
 */
function textBlock(
  f: SearchFilters,
  fields: string[],
  aliasField: string,
  aliasMatches: AliasMatch[][] | undefined
) {
  const terms = splitTerms(f.text).map((term, i) => ({
    OR: [
      ...fields.map(field => ({ [field]: { contains: term } })),
      ...aliasConditions(aliasMatches?.[i], aliasField),
    ],
  }))
  // withAmountFallback ANDs the blocks, so "any" is one block of every term
  return f.textMode === 'any' && terms.length > 1 ? [{ OR: terms }] : terms
}

/** Text terms, OR'ed with an amount match when the whole query is one number. */
function withAmountFallback(terms: object[], f: SearchFilters, amountCond: (r: AmountRange) => object): object[] {
  if (!terms.length) return []
  const asAmount = textAsAmount(f.text)
  return asAmount ? [{ OR: [{ AND: terms }, amountCond(asAmount)] }] : terms
}

const bankAmount = (r: AmountRange) => ({
  OR: [{ debit: { gt: 0, ...bounds(r) } }, { credit: { gt: 0, ...bounds(r) } }],
})

/**
 * Where for BankTransaction. Never null now that bank rows carry categories
 * (a category filter matches the rows set to one of them); the type keeps
 * room for filters that rule bank rows out.
 */
export function buildBankWhere(
  f: SearchFilters,
  aliasMatches?: AliasMatch[][],
  uncategorized?: UncategorizedContext
): Prisma.BankTransactionWhereInput | null {
  const and: object[] = []
  if (f.categories?.length) and.push({ category: { in: f.categories } })
  if (f.uncategorized) {
    and.push({ category: null })
    // The card payment never takes a category, so it isn't missing one
    if (uncategorized?.cardPaymentIds.length) and.push({ id: { notIn: uncategorized.cardPaymentIds } })
  }
  if (f.accountIds?.length) and.push({ accountId: { in: f.accountIds } })
  if (!f.includeIgnored) and.push({ ignored: false })
  const dates = dayRange(f)
  if (dates) and.push({ date: dates })
  if (f.amount) and.push(bankAmount(f.amount))
  and.push(
    ...withAmountFallback(
      textBlock(f, ['description', 'originalDescription', 'note', 'reference'], 'originalDescription', aliasMatches),
      f,
      bankAmount
    )
  )
  if (f.cursor) and.push(afterCursor('date', 'bank', f.cursor))
  return { AND: and } as Prisma.BankTransactionWhereInput
}

const cardAmount = (r: AmountRange) => ({
  OR: [{ chargedAmount: bounds(r) }, { chargedAmount: negBounds(r) }],
})

/** Where for CreditCardTransaction. Amounts match charges and refunds by magnitude. */
export function buildCardWhere(
  f: SearchFilters,
  aliasMatches?: AliasMatch[][],
  uncategorized?: UncategorizedContext
): Prisma.CreditCardTransactionWhereInput {
  const and: object[] = []
  if (f.accountIds?.length) and.push({ accountId: { in: f.accountIds } })
  if (!f.includeIgnored) and.push({ ignored: false })
  const dates = dayRange(f)
  // Purchase date on purpose: "what did I buy on/between ..." is about the
  // purchase. Card totals and pages bucket by billing date instead (ENG-46).
  if (dates) and.push({ transactionDate: dates })
  if (f.amount) and.push(cardAmount(f.amount))
  and.push(
    ...withAmountFallback(
      textBlock(f, ['merchantName', 'originalMerchantName', 'notes', 'reference'], 'originalMerchantName', aliasMatches),
      f,
      cardAmount
    )
  )
  if (f.categories?.length) {
    and.push({
      OR: [{ categoryOverride: { in: f.categories } }, { categoryOverride: null, category: { in: f.categories } }],
    })
  }
  // A card row always carries a category: it lacks one of yours while it shows the issuer's own (unmapped)
  if (f.uncategorized) and.push({ categoryOverride: null, category: { notIn: uncategorized?.categories ?? [] } })
  if (f.cursor) and.push(afterCursor('transactionDate', 'card', f.cursor))
  return { AND: and } as Prisma.CreditCardTransactionWhereInput
}

// ---------------------------------------------------------------------------
// Presentation helpers

export interface TextPart {
  text: string
  match: boolean
}

/** Splits `text` into matched / unmatched parts for every term (case-insensitive, overlaps merged). */
export function highlightParts(text: string, terms: string[]): TextPart[] {
  const lower = text.toLowerCase()
  const marks = new Array<boolean>(text.length).fill(false)
  for (const term of terms) {
    const t = term.toLowerCase()
    if (!t) continue
    for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + 1)) {
      for (let j = i; j < i + t.length; j++) marks[j] = true
    }
  }
  const parts: TextPart[] = []
  for (let i = 0; i < text.length; i++) {
    const last = parts[parts.length - 1]
    if (last && last.match === marks[i]) last.text += text[i]
    else parts.push({ text: text[i], match: marks[i] })
  }
  return parts.length ? parts : [{ text, match: false }]
}

/**
 * The ONE place that knows where a result lives. Today: the account table for
 * its month, filtered with the table's own `search` param. (ENG-19 moves the
 * pages to /banks/[accountId] and /cards/[accountId]; only this changes.)
 */
export function transactionHref(r: Pick<SearchResult, 'source' | 'accountId' | 'date' | 'description' | 'ignored'>): string {
  const [year, month] = r.date.split('-').map(Number)
  const sp = new URLSearchParams({ year: String(year), month: String(month), search: r.description })
  if (r.ignored) sp.set('showIgnored', 'true')
  return accountHref(r.source === 'bank' ? 'BANK' : 'CREDIT_CARD', r.accountId, sp)
}
