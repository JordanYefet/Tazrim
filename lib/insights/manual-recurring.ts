/**
 * Manual recurring series (ENG-71). Pure: no DB, no Prisma types.
 *
 * A manual series is a stored rule on one account, not a detection result:
 * - `pattern`: a normalized description (see `normalizePattern`; words with digits, such
 *   as cheque numbers, are ignored). A transaction matches when its normalized description
 *   contains the pattern as whole words. Empty = no rule, explicit attachments only.
 * - `dayFrom` / `dayTo`: an optional day-of-month window (inclusive, may wrap: 28..3).
 * - `attachedIds` / `detachedIds`: transactions added or removed by hand.
 *
 * There is no amount tolerance: every matching expense belongs to the series, and a
 * level change (out of the detector's ±10% / ₪3 noise band) shows as `priceIncrease`.
 *
 * Claims (no transaction is counted twice):
 * 1. explicit attachments, oldest series first;
 * 2. rule matches, oldest series first, skipping each series' detached ids.
 * The caller then runs `detectRecurring` with `exclude: claimed`, so a detected series
 * never holds a transaction a manual series already has.
 */
import {
  addCycles,
  cadenceSpec,
  fmt,
  median,
  toDay,
  withinTolerance,
  type PriceIncrease,
  type RecurringSeries,
  type RecurringSource,
  type RecurringTransaction,
} from './recurring'

export const MANUAL_CADENCES = ['monthly', 'bimonthly', 'yearly'] as const
export type ManualCadence = (typeof MANUAL_CADENCES)[number]

export function isManualCadence(v: unknown): v is ManualCadence {
  return typeof v === 'string' && (MANUAL_CADENCES as readonly string[]).includes(v)
}

export interface ManualRule {
  /** normalized; '' = no description rule */
  pattern: string
  dayFrom: number | null
  dayTo: number | null
}

export interface ManualSeriesDef extends ManualRule {
  id: string
  accountId: string
  source: RecurringSource
  name: string
  cadence: ManualCadence
  attachedIds: string[]
  detachedIds: string[]
}

/** What the editor needs to reopen a series: its rule and its hand-made membership */
export interface ManualInfo extends ManualRule {
  id: string
  attachedIds: string[]
  detachedIds: string[]
}

export interface ManualRecurringSeries extends RecurringSeries {
  manual: ManualInfo
}

export const MANUAL_KEY_PREFIX = 'manual|'
export const manualKey = (id: string) => MANUAL_KEY_PREFIX + id

/** Same noise band as the detector: changes inside it are not a new price level */
const LEVEL_TOLERANCE = { minOccurrences: 1, tolerancePct: 0.1, toleranceAbs: 3 }
/** a new level starts only after the current one was seen this often, so one odd charge isn't a "price change" */
const MIN_RUN_BEFORE_LEVEL = 2

// ---------- matching ----------

/**
 * Matching form of a description or a pattern: NFKC, lowercase, every word that holds a
 * digit dropped (cheque numbers, references like "P1A2B3"), punctuation removed, whitespace
 * collapsed. A text made only of such words keeps its letters instead of becoming empty.
 */
export function normalizePattern(s: string): string {
  const clean = (t: string) => t.replace(/[^\p{L}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
  const text = s.normalize('NFKC').toLowerCase()
  return clean(text.split(/\s+/).filter(t => !/\d/.test(t)).join(' ')) || clean(text.replace(/\d+/g, ' '))
}

export function descriptionMatches(description: string, pattern: string): boolean {
  const p = normalizePattern(pattern)
  if (!p) return false
  return ` ${normalizePattern(description)} `.includes(` ${p} `)
}

/** day of month (1-31) inside the window; no window = always */
export function inDayWindow(dayOfMonth: number, from: number | null, to: number | null): boolean {
  if (from == null || to == null) return true
  return from <= to ? dayOfMonth >= from && dayOfMonth <= to : dayOfMonth >= from || dayOfMonth <= to
}

const dayOfMonth = (d: Date | string) => new Date(toDay(d) * 86_400_000).getUTCDate()

/** Does the rule (not attachments) take this transaction? Expenses only. */
export function matchesRule(t: RecurringTransaction, rule: ManualRule): boolean {
  if (!(t.amount > 0) || !rule.pattern) return false
  const text = descriptionMatches(t.originalDescription ?? t.description, rule.pattern) || descriptionMatches(t.description, rule.pattern)
  return text && inDayWindow(dayOfMonth(t.date), rule.dayFrom, rule.dayTo)
}

function belongsTo(def: ManualSeriesDef, t: RecurringTransaction) {
  return t.source === def.source && (t.accountId ?? '') === def.accountId
}

/**
 * Which transactions each series gets, in `defs` order of precedence (pass oldest first).
 * Returns series id → its transactions.
 */
export function assignManual(defs: ManualSeriesDef[], transactions: RecurringTransaction[]): Map<string, RecurringTransaction[]> {
  const claimed = new Set<string>()
  const out = new Map<string, RecurringTransaction[]>(defs.map(d => [d.id, []]))
  const byId = new Map(transactions.map(t => [t.id, t]))

  for (const def of defs) {
    for (const id of def.attachedIds) {
      const t = byId.get(id)
      if (!t || claimed.has(id) || !belongsTo(def, t) || !(t.amount > 0)) continue
      claimed.add(id)
      out.get(def.id)!.push(t)
    }
  }
  for (const def of defs) {
    if (!def.pattern) continue
    const detached = new Set(def.detachedIds)
    for (const t of transactions) {
      if (claimed.has(t.id) || detached.has(t.id) || !belongsTo(def, t) || !matchesRule(t, def)) continue
      claimed.add(t.id)
      out.get(def.id)!.push(t)
    }
  }
  return out
}

// ---------- series ----------

interface Levels {
  latestAmount: number
  priceIncrease: PriceIncrease | null
}

/** Price levels over the charges (oldest first), with no amount limit on membership */
export function priceLevels(rows: { day: number; amount: number }[]): Levels {
  if (!rows.length) return { latestAmount: 0, priceIncrease: null }
  const starts = [0]
  for (let i = 1; i < rows.length; i++) {
    const start = starts[starts.length - 1]
    const level = median(rows.slice(start, i).map(r => r.amount))
    if (withinTolerance(rows[i].amount, level, LEVEL_TOLERANCE) || i - start < MIN_RUN_BEFORE_LEVEL) continue
    // A change sticks when the next charge agrees with it (or it is the latest charge);
    // one odd charge between two normal ones stays in the current level
    const next = rows[i + 1]
    if (!next || withinTolerance(next.amount, rows[i].amount, LEVEL_TOLERANCE)) starts.push(i)
  }
  const cur = starts[starts.length - 1]
  const latestAmount = median(rows.slice(cur).map(r => r.amount))
  if (starts.length < 2) return { latestAmount, priceIncrease: null }
  const from = median(rows.slice(starts[starts.length - 2], cur).map(r => r.amount))
  return {
    latestAmount,
    priceIncrease: latestAmount > from ? { from, to: latestAmount, since: fmt(rows[cur].day) } : null,
  }
}

/**
 * Builds the series for one definition from its transactions. `today` is a day number
 * (see `toDay`); null = the series has nothing to judge by (no rows on the account).
 */
export function buildManualSeries(def: ManualSeriesDef, members: RecurringTransaction[], today: number | null): ManualRecurringSeries {
  const spec = cadenceSpec(def.cadence)
  const rows = members
    .map(t => ({ id: t.id, day: toDay(t.date), amount: t.amount, category: t.category ?? null, description: t.description }))
    .sort((a, b) => a.day - b.day || a.id.localeCompare(b.id))
  const { latestAmount, priceIncrease } = priceLevels(rows)
  const first = rows[0]
  const last = rows[rows.length - 1]
  const now = today ?? last?.day ?? 0

  let next = last ? addCycles(last.day, spec, 1) : now
  if (last) for (let n = 2; next + spec.tol < now; n++) next = addCycles(last.day, spec, n)

  const key = manualKey(def.id)
  return {
    key,
    baseKey: key,
    name: def.name,
    merchant: def.pattern,
    source: def.source,
    accountId: def.accountId,
    category: [...rows].reverse().find(r => r.category)?.category ?? null,
    cadence: def.cadence,
    amount: rows.length ? median(rows.map(r => r.amount)) : 0,
    latestAmount,
    monthlyAmount: Math.round(latestAmount * spec.perMonth * 100) / 100,
    occurrences: rows.length,
    firstDate: first ? fmt(first.day) : '',
    lastDate: last ? fmt(last.day) : '',
    nextDate: last ? fmt(next) : '',
    active: !!last && now - last.day <= spec.days * spec.maxGapCycles + spec.tol,
    isNew: false,
    priceIncrease,
    isCardPayment: false,
    isInstallment: false,
    transactionIds: rows.map(r => r.id),
    manual: {
      id: def.id,
      pattern: def.pattern,
      dayFrom: def.dayFrom,
      dayTo: def.dayTo,
      attachedIds: def.attachedIds,
      detachedIds: def.detachedIds,
    },
  }
}

/**
 * Every manual series built over `transactions` (all rows of their accounts, ignored rows
 * left out by the caller), plus the ids they claim. Without `today`, each account is judged
 * as of its own latest transaction, like the detector.
 */
export function resolveManualSeries(
  defs: ManualSeriesDef[],
  transactions: RecurringTransaction[],
  options: { today?: Date | string } = {}
): { series: ManualRecurringSeries[]; claimed: Set<string> } {
  const fixedToday = options.today !== undefined ? toDay(options.today) : null
  const dataEnd = new Map<string, number>()
  for (const t of transactions) {
    const acct = `${t.source}|${t.accountId ?? ''}`
    dataEnd.set(acct, Math.max(dataEnd.get(acct) ?? -Infinity, toDay(t.date)))
  }
  const assigned = assignManual(defs, transactions)
  const claimed = new Set<string>()
  const series = defs.map(def => {
    const members = assigned.get(def.id) ?? []
    for (const t of members) claimed.add(t.id)
    return buildManualSeries(def, members, fixedToday ?? dataEnd.get(`${def.source}|${def.accountId}`) ?? null)
  })
  return { series, claimed }
}

/** A day window is valid when both ends are 1-31, or both are absent */
export function validDayWindow(from: unknown, to: unknown): boolean {
  if (from == null && to == null) return true
  const ok = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 31
  return ok(from) && ok(to)
}
