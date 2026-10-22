/**
 * Storage and previews for manual recurring series (ENG-71). The matching itself is
 * pure (lib/insights/manual-recurring.ts); getRecurringSeries merges the result with
 * the detected series.
 */
import { prisma, type Db } from './client'
import { accountWhere, type AccountFilter } from './accounts'
import {
  assignManual,
  buildManualSeries,
  isManualCadence,
  matchesRule,
  normalizePattern,
  validDayWindow,
  type ManualCadence,
  type ManualSeriesDef,
} from '../insights/manual-recurring'
import { displayName, fromBankRow, fromCardRow, toDay, type RecurringSource, type RecurringTransaction } from '../insights/recurring'
import type { ManualRecurringMember, ManualRecurringSeries } from '@prisma/client'

export const MANUAL_NAME_MAX = 80
export const MANUAL_PATTERN_MAX = 120
/** preview rows returned at most (the summary still covers every match) */
const PREVIEW_LIMIT = 200

type Row = ManualRecurringSeries & { members: ManualRecurringMember[] }

function toDef(row: Row): ManualSeriesDef {
  return {
    id: row.id,
    accountId: row.accountId,
    source: row.source === 'card' ? 'card' : 'bank',
    name: row.name,
    cadence: isManualCadence(row.cadence) ? row.cadence : 'monthly',
    pattern: row.pattern,
    dayFrom: row.dayFrom,
    dayTo: row.dayTo,
    attachedIds: row.members.filter(m => m.mode === 'ATTACHED').map(m => m.transactionId),
    detachedIds: row.members.filter(m => m.mode === 'DETACHED').map(m => m.transactionId),
  }
}

/** Manual series of the given account(s), oldest first (the order of precedence for claims) */
export async function listManualSeries(filter?: AccountFilter, db: Db = prisma): Promise<ManualSeriesDef[]> {
  const rows = await db.manualRecurringSeries.findMany({
    where: accountWhere(filter),
    include: { members: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  })
  return rows.map(toDef)
}

// ---------- input ----------

export interface ManualSeriesInput {
  name: string
  cadence: ManualCadence
  pattern: string
  dayFrom: number | null
  dayTo: number | null
  attachedIds: string[]
  detachedIds: string[]
}

const idList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(x => typeof x === 'string') ? [...new Set(v as string[])] : null

/**
 * Validates a request body. With `partial`, only the fields present are checked and
 * returned (an edit); otherwise name and cadence are required (a new series).
 */
export function parseManualInput(
  body: Record<string, unknown>,
  opts: { partial?: boolean } = {}
): { ok: true; value: Partial<ManualSeriesInput> } | { ok: false; error: string } {
  const out: Partial<ManualSeriesInput> = {}
  const has = (k: string) => k in body && body[k] !== undefined

  if (has('name') || !opts.partial) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { ok: false, error: 'חסר שם' }
    if (body.name.trim().length > MANUAL_NAME_MAX) return { ok: false, error: 'השם ארוך מדי' }
    out.name = body.name.trim()
  }
  if (has('cadence') || !opts.partial) {
    if (!isManualCadence(body.cadence)) return { ok: false, error: 'תדירות לא מוכרת' }
    out.cadence = body.cadence
  }
  if (has('pattern')) {
    if (typeof body.pattern !== 'string' || body.pattern.length > MANUAL_PATTERN_MAX) return { ok: false, error: 'תיאור לא תקין' }
    out.pattern = normalizePattern(body.pattern)
  }
  if (has('dayFrom') || has('dayTo')) {
    const from = body.dayFrom ?? null
    const to = body.dayTo ?? null
    if (!validDayWindow(from, to)) return { ok: false, error: 'טווח ימים לא תקין' }
    out.dayFrom = from as number | null
    out.dayTo = to as number | null
  }
  for (const k of ['attachedIds', 'detachedIds'] as const) {
    if (!has(k)) continue
    const list = idList(body[k])
    if (!list) return { ok: false, error: 'רשימת עסקאות לא תקינה' }
    out[k] = list
  }
  return { ok: true, value: out }
}

// ---------- transactions ----------

/** Expense-side detector rows of one account (ignored rows left out) */
async function accountTransactions(accountId: string, source: RecurringSource, db: Db = prisma): Promise<RecurringTransaction[]> {
  if (source === 'bank') {
    const rows = await db.bankTransaction.findMany({
      where: { accountId, ignored: false },
      select: { id: true, date: true, description: true, originalDescription: true, debit: true, accountId: true },
    })
    return rows.map(fromBankRow)
  }
  const rows = await db.creditCardTransaction.findMany({
    where: { accountId, ignored: false },
    select: {
      id: true,
      transactionDate: true,
      billingDate: true,
      transactionType: true,
      merchantName: true,
      originalMerchantName: true,
      chargedAmount: true,
      category: true,
      categoryOverride: true,
      accountId: true,
    },
  })
  return rows.map(fromCardRow)
}

async function sourceOf(accountId: string, db: Db = prisma): Promise<RecurringSource | null> {
  const account = await db.account.findUnique({ where: { id: accountId }, select: { kind: true } })
  if (!account) return null
  return account.kind === 'BANK' ? 'bank' : account.kind === 'CREDIT_CARD' ? 'card' : null
}

/** Keeps only ids of this account's transactions */
async function ownIds(accountId: string, source: RecurringSource, ids: string[], db: Db): Promise<string[]> {
  if (!ids.length) return []
  const where = { id: { in: ids }, accountId }
  const rows =
    source === 'bank'
      ? await db.bankTransaction.findMany({ where, select: { id: true } })
      : await db.creditCardTransaction.findMany({ where, select: { id: true } })
  const own = new Set(rows.map(r => r.id))
  return ids.filter(id => own.has(id))
}

async function writeMembers(seriesId: string, accountId: string, source: RecurringSource, input: Partial<ManualSeriesInput>, db: Db) {
  if (input.attachedIds === undefined && input.detachedIds === undefined) return
  const attached = await ownIds(accountId, source, input.attachedIds ?? [], db)
  const detached = (await ownIds(accountId, source, input.detachedIds ?? [], db)).filter(id => !attached.includes(id))
  await db.manualRecurringMember.deleteMany({ where: { seriesId } })
  // A transaction attached by hand belongs to one series only: the latest one it was attached to
  if (attached.length) {
    await db.manualRecurringMember.deleteMany({ where: { transactionId: { in: attached }, mode: 'ATTACHED', seriesId: { not: seriesId } } })
  }
  const data = [
    ...attached.map(transactionId => ({ seriesId, transactionId, mode: 'ATTACHED' as const })),
    ...detached.map(transactionId => ({ seriesId, transactionId, mode: 'DETACHED' as const })),
  ]
  if (data.length) await db.manualRecurringMember.createMany({ data })
}

// ---------- writes ----------

export type ManualWriteResult = { status: 'ok'; id: string } | { status: 'not_found' } | { status: 'invalid'; error: string }

/**
 * Creates a manual series on an account. `replaceOverrideKeys`: override rows of the
 * detected series this one takes over (their transactions move to it), so a stale
 * confirm / rename does not linger.
 */
export async function createManualSeries(
  accountId: string,
  input: ManualSeriesInput,
  opts: { replaceOverrideKeys?: string[] } = {}
): Promise<ManualWriteResult> {
  return prisma.$transaction(async tx => {
    const source = await sourceOf(accountId, tx)
    if (!source) return { status: 'not_found' as const }
    if (!input.pattern && !input.attachedIds.length) return { status: 'invalid' as const, error: 'צריך תיאור או עסקה אחת לפחות' }
    const row = await tx.manualRecurringSeries.create({
      data: {
        accountId,
        source,
        name: input.name,
        cadence: input.cadence,
        pattern: input.pattern,
        dayFrom: input.dayFrom,
        dayTo: input.dayTo,
      },
    })
    await writeMembers(row.id, accountId, source, input, tx)
    const keys = (opts.replaceOverrideKeys ?? []).filter(Boolean)
    if (keys.length) await tx.recurringSeriesOverride.deleteMany({ where: { key: { in: keys } } })
    return { status: 'ok' as const, id: row.id }
  })
}

/** Edits a series; `attachedIds` / `detachedIds`, when given, replace the hand-made membership. */
export async function updateManualSeries(id: string, input: Partial<ManualSeriesInput>): Promise<ManualWriteResult> {
  return prisma.$transaction(async tx => {
    const row = await tx.manualRecurringSeries.findUnique({ where: { id }, include: { members: true } })
    if (!row) return { status: 'not_found' as const }
    const next = { ...toDef(row), ...input }
    if (!next.pattern && !next.attachedIds.length) return { status: 'invalid' as const, error: 'צריך תיאור או עסקה אחת לפחות' }
    const { name, cadence, pattern, dayFrom, dayTo } = input
    await tx.manualRecurringSeries.update({ where: { id }, data: { name, cadence, pattern, dayFrom, dayTo } })
    await writeMembers(id, row.accountId, row.source === 'card' ? 'card' : 'bank', input, tx)
    return { status: 'ok' as const, id }
  })
}

/** Attach one transaction to a series by hand, or detach it */
export async function setManualMember(id: string, transactionId: string, mode: 'attach' | 'detach'): Promise<ManualWriteResult> {
  const row = await prisma.manualRecurringSeries.findUnique({ where: { id }, include: { members: true } })
  if (!row) return { status: 'not_found' }
  const def = toDef(row)
  const without = (ids: string[]) => ids.filter(x => x !== transactionId)
  return updateManualSeries(id, {
    attachedIds: mode === 'attach' ? [...without(def.attachedIds), transactionId] : without(def.attachedIds),
    detachedIds: mode === 'detach' ? [...without(def.detachedIds), transactionId] : without(def.detachedIds),
  })
}

export async function deleteManualSeries(id: string): Promise<boolean> {
  const { count } = await prisma.manualRecurringSeries.deleteMany({ where: { id } })
  return count > 0
}

// ---------- preview ----------

export type PreviewState = 'rule' | 'attached' | 'detached' | 'other'

export interface PreviewRow {
  id: string
  /** YYYY-MM-DD */
  date: string
  description: string
  amount: number
  /** in the series by the rule or by hand; detached by hand; or held by another manual series */
  state: PreviewState
  /** name of the manual series that holds it (state "other"), or of the detected series it moves from */
  from?: string
}

export interface ManualPreview {
  rows: PreviewRow[]
  /** matches beyond `rows` (the list is capped) */
  more: number
  occurrences: number
  latestAmount: number
  monthlyAmount: number
  priceIncrease: { from: number; to: number; since: string } | null
  firstDate: string
  lastDate: string
}

/**
 * What a rule would match on an account, before saving: the transactions in the
 * series, the ones detached by hand, and matches another manual series already holds.
 * `seriesId` previews an edit (the series keeps its place in the order of precedence).
 * `detectedNames` (transaction id → detected series name) marks rows that would move
 * out of a detected series.
 */
export async function previewManualSeries(
  params: {
    accountId: string
    seriesId?: string | null
    cadence: ManualCadence
    pattern: string
    dayFrom: number | null
    dayTo: number | null
    attachedIds: string[]
    detachedIds: string[]
  },
  detectedNames: Map<string, string> = new Map()
): Promise<ManualPreview | null> {
  const source = await sourceOf(params.accountId)
  if (!source) return null
  const [txs, defs] = await Promise.all([accountTransactions(params.accountId, source), listManualSeries(params.accountId)])
  const draft: ManualSeriesDef = {
    id: params.seriesId ?? '__draft__',
    accountId: params.accountId,
    source,
    name: '',
    cadence: params.cadence,
    pattern: normalizePattern(params.pattern),
    dayFrom: params.dayFrom,
    dayTo: params.dayTo,
    attachedIds: params.attachedIds,
    detachedIds: params.detachedIds,
  }
  const idx = defs.findIndex(d => d.id === draft.id)
  const all = idx >= 0 ? defs.map(d => (d.id === draft.id ? draft : d)) : [...defs, draft]
  const assigned = assignManual(all, txs)
  const holder = new Map<string, string>()
  for (const d of all) if (d.id !== draft.id) for (const t of assigned.get(d.id) ?? []) holder.set(t.id, d.name)

  const members = assigned.get(draft.id) ?? []
  const memberIds = new Set(members.map(t => t.id))
  const attached = new Set(draft.attachedIds)
  const detached = new Set(draft.detachedIds)
  const ruleOf = (t: RecurringTransaction) => matchesRule(t, draft)
  const rows: PreviewRow[] = []
  for (const t of txs) {
    let state: PreviewState | null = null
    if (memberIds.has(t.id)) state = ruleOf(t) ? 'rule' : 'attached'
    else if (detached.has(t.id) && ruleOf(t)) state = 'detached'
    else if (holder.has(t.id) && (ruleOf(t) || attached.has(t.id))) state = 'other'
    if (!state) continue
    const from = state === 'other' ? holder.get(t.id) : state === 'detached' ? undefined : detectedNames.get(t.id)
    rows.push({
      id: t.id,
      date: new Date(toDay(t.date) * 86_400_000).toISOString().slice(0, 10),
      description: t.description,
      amount: t.amount,
      state,
      ...(from ? { from } : {}),
    })
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))

  const end = txs.reduce((m, t) => Math.max(m, toDay(t.date)), -Infinity)
  const s = buildManualSeries(draft, members, Number.isFinite(end) ? end : null)
  return {
    rows: rows.slice(0, PREVIEW_LIMIT),
    more: Math.max(0, rows.length - PREVIEW_LIMIT),
    occurrences: s.occurrences,
    latestAmount: s.latestAmount,
    monthlyAmount: s.monthlyAmount,
    priceIncrease: s.priceIncrease,
    firstDate: s.firstDate,
    lastDate: s.lastDate,
  }
}

// ---------- one transaction ----------

/** The description without words that hold digits (a cheque number changes every month) */
function suggestedName(description: string) {
  const words = displayName(description).split(/\s+/).filter(w => !/\d/.test(w))
  return (words.join(' ') || description.trim()).slice(0, MANUAL_NAME_MAX)
}

export interface TransactionForMarking {
  id: string
  source: RecurringSource
  accountId: string
  date: string
  description: string
  amount: number
  /** default name and rule for a new series made from it */
  suggestion: { name: string; pattern: string; cadence: ManualCadence }
}

export async function getTransactionForMarking(source: RecurringSource, id: string): Promise<TransactionForMarking | null> {
  const t =
    source === 'bank'
      ? await prisma.bankTransaction.findUnique({ where: { id } }).then(r => (r ? fromBankRow(r) : null))
      : await prisma.creditCardTransaction.findUnique({ where: { id } }).then(r => (r ? fromCardRow(r) : null))
  if (!t || !t.accountId) return null
  const raw = t.originalDescription ?? t.description
  return {
    id,
    source,
    accountId: t.accountId,
    date: new Date(toDay(t.date) * 86_400_000).toISOString().slice(0, 10),
    description: t.description,
    amount: t.amount,
    suggestion: { name: suggestedName(t.description), pattern: normalizePattern(raw), cadence: 'monthly' },
  }
}
