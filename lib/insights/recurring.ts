import { isCardPaymentDescription } from './card-payment'
/**
 * Recurring-charge (subscription) detection. Pure: no DB, no Prisma types.
 *
 * Usage
 * -----
 * 1. Map rows with `fromBankRow` / `fromCardRow` (skip `ignored` rows first).
 *    Bank rows: the charge is `debit`; credits (income) have debit 0 and are skipped.
 *    Card rows: the charge is `chargedAmount` on `transactionDate`; refunds are negative and skipped.
 * 2. `detectRecurring(rows, { today })` returns one `RecurringSeries` per detected series.
 * 3. `recurringMonthlyTotal(series, { sources, excludedKeys })` sums the active ones.
 *
 * Bank vs card: the bank's monthly debit to the card company *is* the card charges
 * (see memory "bank includes card payments"). Running on both sources is fine: that
 * debit is detected as a recurring bank series flagged `isCardPayment`, and the total
 * leaves it out by default so the card subscriptions it pays for are not counted twice.
 * If you only total bank rows (no card data), pass `excludeCardPayments: false`.
 *
 * Algorithm
 * ---------
 * - Group by source + accountId + normalized merchant (from `originalDescription` when
 *   given, so alias renames don't change grouping or keys).
 * - Within a group, chain charges chronologically per cadence (monthly, then yearly;
 *   weekly only via `cadences`, since cafés and transfers look weekly too). A charge joins a chain when the gap since the chain's last charge is
 *   1 or 2 cycles (± the cadence's day tolerance) and the amount is within
 *   ±max(10%, ₪3) of the chain's current price level. A charge outside the tolerance
 *   (but within 1.5x either way) may still join as a price change, but only once the
 *   current level has been seen at least twice — so random amounts don't chain.
 * - A chain is a series when it has ≥ minOccurrences (3) charges and covers at least
 *   2/3 of the cycles it spans (one skipped month in a 3-charge series is fine, two isn't).
 * - Bank card-company debits (`isCardPaymentDescription`) are chained on cadence alone,
 *   since their amount is that month's card spend.
 * - `active`: last charge within 2 cycles + tolerance of `today`. `nextDate`: last charge
 *   plus one cycle, rolled forward while it is already more than the tolerance in the past.
 * - `isNew`: first charge within 3 cycles (+2× tolerance) of `today`, and the same source
 *   has data from at least a cycle before it (otherwise it's just where the data starts).
 * - `priceIncrease`: the current price level (after the last out-of-tolerance step) is above
 *   the previous level. Changes inside the tolerance are treated as noise.
 * - Keys: source|accountId|merchant|cadence. If a merchant has several series of the same
 *   cadence, `|<first charge amount rounded>` is added, then `|#n` (by first charge) on a clash.
 *   `baseKey` (without cadence/amount) lets persistence fall back when a merchant has one series.
 */

export type RecurringSource = 'bank' | 'card'
export type Cadence = 'weekly' | 'monthly' | 'yearly'

export interface RecurringTransaction {
  id: string
  /** Date, or an ISO string. A bare 'YYYY-MM-DD' is read as that calendar day. */
  date: Date | string
  /** Positive = money out. Zero/negative rows (income, refunds) are ignored. */
  amount: number
  /** Display text (alias-resolved description / merchant name) */
  description: string
  /** Raw text from the statement; used for grouping and keys when present */
  originalDescription?: string
  source: RecurringSource
  accountId?: string
  category?: string | null
  /** card installment plan (תשלומים): recurs, but it's a purchase being paid off, not a subscription */
  isInstallment?: boolean
}

export interface PriceIncrease {
  from: number
  to: number
  /** first charge at the new price */
  since: string
}

export interface RecurringSeries {
  /** Stable id: source|accountId|merchant|cadence, plus |amount only when a merchant has several series */
  key: string
  /** source|accountId|merchant — shared by every series of the same merchant */
  baseKey: string
  name: string
  merchant: string
  source: RecurringSource
  accountId?: string
  category: string | null
  cadence: Cadence
  /** median of all charges */
  amount: number
  /** median of the charges at the current price level */
  latestAmount: number
  /** latestAmount converted to a per-month figure (weekly × 52/12, yearly / 12) */
  monthlyAmount: number
  occurrences: number
  /** YYYY-MM-DD */
  firstDate: string
  lastDate: string
  nextDate: string
  /** still charging: last charge no more than ~2 cycles before `today` */
  active: boolean
  /** first charge within the last ~3 cycles, and there's earlier data proving it wasn't there before */
  isNew: boolean
  priceIncrease: PriceIncrease | null
  /** bank series that is the monthly payment to a card company */
  isCardPayment: boolean
  /** card installment plan; listed apart and left out of the subscriptions total */
  isInstallment: boolean
  transactionIds: string[]
}

export interface RecurringOptions {
  /** Reference date. Defaults to the latest transaction date of each account (source + accountId). */
  today?: Date | string
  minOccurrences?: number
  /** relative amount tolerance, default 0.1 (±10%) */
  tolerancePct?: number
  /** absolute amount tolerance floor in ₪, default 3 */
  toleranceAbs?: number
  /** cadences to look for, default monthly + yearly. Weekly is opt-in: cafés and P2P transfers look weekly too. */
  cadences?: Cadence[]
}

type Tolerance = { minOccurrences: number; tolerancePct: number; toleranceAbs: number }

interface CadenceSpec {
  cadence: Cadence
  days: number
  /** allowed deviation from a whole number of cycles, in days */
  tol: number
  maxGapCycles: number
  perMonth: number
}

const CADENCES: CadenceSpec[] = [
  { cadence: 'weekly', days: 7, tol: 2, maxGapCycles: 2, perMonth: 52 / 12 },
  { cadence: 'monthly', days: 30.44, tol: 6, maxGapCycles: 2, perMonth: 1 },
  { cadence: 'yearly', days: 365.25, tol: 20, maxGapCycles: 2, perMonth: 1 / 12 },
]

const MIN_COVERAGE = 2 / 3
const MAX_PRICE_JUMP = 1.5
const MIN_RUN_BEFORE_JUMP = 2
const NEW_WITHIN_CYCLES = 3

// ---------- normalization ----------

function isReferenceToken(t: string) {
  const digits = (t.match(/\d/g) ?? []).length
  if (digits >= 4) return true
  return t.length >= 5 && digits > 0 && /[a-z֐-׿]/i.test(t)
}

function cleanTokens(s: string) {
  return s
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .filter(t => t && !isReferenceToken(t))
}

/** Grouping form of a description: trimmed, whitespace collapsed, lowercased, reference numbers stripped */
export function normalizeMerchant(s: string): string {
  return cleanTokens(s).join(' ').toLowerCase()
}

function displayName(s: string) {
  const cleaned = cleanTokens(s).join(' ')
  return cleaned || s.trim()
}

export { isCardPaymentDescription }

// ---------- dates (calendar days, timezone-safe) ----------

const DAY = 86_400_000

/** days since epoch for the calendar date */
function toDay(d: Date | string): number {
  if (typeof d === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY
    d = new Date(d)
  }
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY
}

function fmt(day: number) {
  return new Date(day * DAY).toISOString().slice(0, 10)
}

function addCycles(day: number, spec: CadenceSpec, n: number) {
  if (spec.cadence === 'weekly') return day + 7 * n
  const d = new Date(day * DAY)
  const months = spec.cadence === 'monthly' ? n : 12 * n
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + months
  const lastOfMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Date.UTC(y, m, Math.min(d.getUTCDate(), lastOfMonth)) / DAY
}

// ---------- helpers ----------

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const mid = s.length >> 1
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(v * 100) / 100
}

/** whole number of cycles the gap spans, or null when it isn't a valid gap */
function gapCycles(gap: number, spec: CadenceSpec): number | null {
  const k = Math.round(gap / spec.days)
  if (k < 1 || k > spec.maxGapCycles) return null
  return Math.abs(gap - k * spec.days) <= spec.tol + (k - 1) ? k : null
}

interface Row {
  id: string
  day: number
  amount: number
  description: string
  category: string | null
  isInstallment: boolean
}

interface Chain {
  rows: Row[]
  /** indexes into rows where each price level starts; the last one is the current level */
  levelStarts: number[]
  cycles: number
}

function withinTolerance(amount: number, level: number, o: Tolerance) {
  return Math.abs(amount - level) <= Math.max(level * o.tolerancePct, o.toleranceAbs)
}

function chainFor(rows: Row[], spec: CadenceSpec, o: Tolerance): Chain[] {
  const chains: Chain[] = []
  for (const row of rows) {
    let best: { chain: Chain; k: number; diff: number } | null = null
    let jump: { chain: Chain; k: number } | null = null
    for (const chain of chains) {
      const last = chain.rows[chain.rows.length - 1]
      const k = gapCycles(row.day - last.day, spec)
      if (k === null) continue
      const levelRows = chain.rows.slice(chain.levelStarts[chain.levelStarts.length - 1])
      const level = median(levelRows.map(r => r.amount))
      if (withinTolerance(row.amount, level, o)) {
        const diff = Math.abs(row.amount - level)
        if (!best || diff < best.diff) best = { chain, k, diff }
      } else if (
        !jump &&
        levelRows.length >= MIN_RUN_BEFORE_JUMP &&
        row.amount <= level * MAX_PRICE_JUMP &&
        row.amount >= level / MAX_PRICE_JUMP
      ) {
        jump = { chain, k }
      }
    }
    if (best) {
      best.chain.rows.push(row)
      best.chain.cycles += best.k
    } else if (jump) {
      jump.chain.levelStarts.push(jump.chain.rows.length)
      jump.chain.rows.push(row)
      jump.chain.cycles += jump.k
    } else {
      chains.push({ rows: [row], levelStarts: [0], cycles: 0 })
    }
  }
  return chains
}

function priceIncreaseOf(chain: Chain): PriceIncrease | null {
  const n = chain.levelStarts.length
  if (n < 2) return null
  const prev = chain.levelStarts[n - 2]
  const cur = chain.levelStarts[n - 1]
  const from = median(chain.rows.slice(prev, cur).map(r => r.amount))
  const to = median(chain.rows.slice(cur).map(r => r.amount))
  if (to <= from) return null
  return { from, to, since: fmt(chain.rows[cur].day) }
}

// ---------- detection ----------

export function detectRecurring(transactions: RecurringTransaction[], options: RecurringOptions = {}): RecurringSeries[] {
  const o = {
    minOccurrences: options.minOccurrences ?? 3,
    tolerancePct: options.tolerancePct ?? 0.1,
    toleranceAbs: options.toleranceAbs ?? 3,
  }
  const cadences = CADENCES.filter(c => (options.cadences ?? ['monthly', 'yearly']).includes(c.cadence))
  const fixedToday = options.today !== undefined ? toDay(options.today) : null

  const groups = new Map<string, { source: RecurringSource; accountId?: string; merchant: string; rows: Row[] }>()
  // per account (source + accountId): where its statements start and end
  const dataStart = new Map<string, number>()
  const dataEnd = new Map<string, number>()
  const accountOf = (source: RecurringSource, accountId?: string) => `${source}|${accountId ?? ''}`

  for (const t of transactions) {
    const day = toDay(t.date)
    const acct = accountOf(t.source, t.accountId)
    dataStart.set(acct, Math.min(dataStart.get(acct) ?? Infinity, day))
    dataEnd.set(acct, Math.max(dataEnd.get(acct) ?? -Infinity, day))
    if (!(t.amount > 0)) continue
    const merchant = normalizeMerchant(t.originalDescription ?? t.description)
    if (!merchant) continue
    const baseKey = [t.source, t.accountId ?? '', merchant].join('|')
    let g = groups.get(baseKey)
    if (!g) groups.set(baseKey, (g = { source: t.source, accountId: t.accountId, merchant, rows: [] }))
    g.rows.push({ id: t.id, day, amount: t.amount, description: t.description, category: t.category ?? null, isInstallment: !!t.isInstallment })
  }

  const result: RecurringSeries[] = []

  for (const [baseKey, g] of groups) {
    let remaining = [...g.rows].sort((a, b) => a.day - b.day)
    const found: { chain: Chain; spec: CadenceSpec }[] = []
    // The bank's card-company debit is recurring by date but its amount is whatever was
    // spent on the card that month, so for it only the cadence counts.
    const isCardPayment =
      g.source === 'bank' && isCardPaymentDescription(g.merchant + ' ' + remaining[remaining.length - 1].description)
    const tol = isCardPayment ? { ...o, tolerancePct: Infinity } : o

    for (const spec of cadences) {
      const chains = chainFor(remaining, spec, tol).filter(
        c => c.rows.length >= o.minOccurrences && c.rows.length / (c.cycles + 1) >= MIN_COVERAGE
      )
      if (!chains.length) continue
      const used = new Set(chains.flatMap(c => c.rows.map(r => r.id)))
      remaining = remaining.filter(r => !used.has(r.id))
      found.push(...chains.map(chain => ({ chain, spec })))
    }

    // Keys: merchant + cadence; when a merchant has several series of one cadence, add the
    // first charge's amount, then an ordinal (by first charge) if that still collides.
    found.sort((a, b) => a.chain.rows[0].day - b.chain.rows[0].day)
    const keys = new Set<string>()
    const keyFor = (chain: Chain, spec: CadenceSpec) => {
      let key = [baseKey, spec.cadence].join('|')
      if (found.filter(f => f.spec === spec).length > 1) key += '|' + Math.round(chain.rows[0].amount)
      for (let n = 2; keys.has(key); n++) key = key.replace(/(\|#\d+)?$/, `|#${n}`)
      keys.add(key)
      return key
    }

    for (const { chain, spec } of found) {
      const rows = chain.rows
      const first = rows[0]
      const last = rows[rows.length - 1]
      const acct = accountOf(g.source, g.accountId)
      const today = fixedToday ?? dataEnd.get(acct)!
      const latestAmount = median(rows.slice(chain.levelStarts[chain.levelStarts.length - 1]).map(r => r.amount))

      let next = addCycles(last.day, spec, 1)
      for (let n = 2; next + spec.tol < today; n++) next = addCycles(last.day, spec, n)

      const key = keyFor(chain, spec)
      const name = displayName(last.description)

      result.push({
        key,
        baseKey,
        name,
        merchant: g.merchant,
        source: g.source,
        ...(g.accountId !== undefined ? { accountId: g.accountId } : {}),
        category: [...rows].reverse().find(r => r.category)?.category ?? null,
        cadence: spec.cadence,
        amount: median(rows.map(r => r.amount)),
        latestAmount,
        monthlyAmount: Math.round(latestAmount * spec.perMonth * 100) / 100,
        occurrences: rows.length,
        firstDate: fmt(first.day),
        lastDate: fmt(last.day),
        nextDate: fmt(next),
        active: today - last.day <= spec.days * spec.maxGapCycles + spec.tol,
        isNew:
          today - first.day <= spec.days * NEW_WITHIN_CYCLES + spec.tol * 2 &&
          dataStart.get(acct)! <= first.day - spec.days + spec.tol,
        priceIncrease: priceIncreaseOf(chain),
        isCardPayment,
        isInstallment: rows.filter(r => r.isInstallment).length * 2 > rows.length,
        transactionIds: rows.map(r => r.id),
      })
    }
  }

  return result.sort((a, b) => b.monthlyAmount - a.monthlyAmount || a.name.localeCompare(b.name))
}

/**
 * Monthly cost of the active series. `sources` is required on purpose: decide which
 * statements you're totalling. Card-payment bank series are skipped by default (their
 * cost is already the card series); pass `excludeCardPayments: false` when the total
 * covers bank rows only. Installment plans are skipped too unless `excludeInstallments: false`. `excludedKeys` drops series the user dismissed.
 */
export function recurringMonthlyTotal(
  series: RecurringSeries[],
  opts: {
    sources: RecurringSource[]
    excludeCardPayments?: boolean
    excludeInstallments?: boolean
    excludedKeys?: Iterable<string>
    includeInactive?: boolean
  }
): number {
  const excluded = new Set(opts.excludedKeys ?? [])
  const excludeCardPayments = opts.excludeCardPayments ?? true
  const excludeInstallments = opts.excludeInstallments ?? true
  const total = series
    .filter(s => opts.sources.includes(s.source))
    .filter(s => opts.includeInactive || s.active)
    .filter(s => !(excludeCardPayments && s.isCardPayment))
    .filter(s => !(excludeInstallments && s.isInstallment))
    .filter(s => !excluded.has(s.key))
    .reduce((sum, s) => sum + s.monthlyAmount, 0)
  return Math.round(total * 100) / 100
}

// ---------- row adapters (structural, so they work with Prisma rows without importing Prisma) ----------

export function fromBankRow(row: {
  id: string
  date: Date | string
  description: string
  originalDescription?: string
  debit: number
  credit?: number
  accountId?: string | null
}): RecurringTransaction {
  return {
    id: row.id,
    date: row.date,
    amount: row.debit,
    description: row.description,
    ...(row.originalDescription !== undefined ? { originalDescription: row.originalDescription } : {}),
    source: 'bank',
    ...(row.accountId ? { accountId: row.accountId } : {}),
    category: null,
  }
}

const INSTALLMENT_TYPE = /תשלומים|installment/i

/** MAX `transactionType` for an installment plan */
export function isInstallmentType(transactionType: string | null | undefined): boolean {
  return !!transactionType && INSTALLMENT_TYPE.test(transactionType)
}

/**
 * Card row → detector row. Installment rows all keep the purchase date, so they're
 * dated by `billingDate` (the month each installment is charged) when it's given.
 * Regular charges keep the purchase date on purpose: a subscription's cadence is
 * its charge day, while the billing day is the same for every row of a statement.
 */
export function fromCardRow(row: {
  id: string
  transactionDate: Date | string
  billingDate?: Date | string
  transactionType?: string | null
  merchantName: string
  originalMerchantName?: string
  chargedAmount: number
  category?: string | null
  categoryOverride?: string | null
  accountId?: string | null
}): RecurringTransaction {
  const isInstallment = isInstallmentType(row.transactionType)
  return {
    id: row.id,
    date: isInstallment && row.billingDate ? row.billingDate : row.transactionDate,
    amount: row.chargedAmount,
    description: row.merchantName,
    ...(row.originalMerchantName !== undefined ? { originalDescription: row.originalMerchantName } : {}),
    source: 'card',
    ...(row.accountId ? { accountId: row.accountId } : {}),
    category: row.categoryOverride ?? row.category ?? null,
    isInstallment,
  }
}
