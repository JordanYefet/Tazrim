/**
 * Where a sync's accounts go and how their rows are stored (ENG-91): the
 * remembered links (SyncLink), the start date a sync defaults to, and the
 * store itself, through the same path and de-dup as an uploaded file.
 */
import type { Account } from '@prisma/client'
import { prisma } from '@/lib/db/client'
import { createAccount } from '@/lib/db/accounts'
import { storeRows, type ImportResult } from '@/lib/upload/import'
import { localDay } from '@/lib/upload/card-dedupe'
import type { ParsedBankTransaction, ParsedCCTransaction } from '@/lib/parsers/types'
import { lastFour, mapBankAccount, mapCardAccount, type ScrapedAccount } from './map'
import {
  balanceMismatch,
  fillBank,
  fillCard,
  isSyncedFile,
  matchBankByDayAndAmount,
  matchCardByDayAndAmount,
  type BalanceMismatch,
  type Match,
} from './overlap'
import type { SyncCompany } from './providers'

/** Days a default sync reaches back before the last one, so late-settling rows are not missed (de-dup absorbs the overlap). */
const OVERLAP_DAYS = 7
/** A first sync (nothing stored yet) reaches back this far */
const FIRST_SYNC_MONTHS = 3

export interface SourceSummary {
  /** Last sync of any of the company's accounts, ISO; null when never */
  lastSyncedAt: string | null
  /** The start date a sync defaults to, YYYY-MM-DD */
  defaultStart: string
  /** The earliest start the company's site allows, YYYY-MM-DD */
  earliest: string
}

function monthsAgo(n: number, now = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setMonth(d.getMonth() - n)
  return d
}

function daysBefore(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() - n)
  return out
}

/** The earliest start a sync of the company accepts: as far back as its site allows. */
export function earliestStart(company: Pick<SyncCompany, 'historyMonths'>, now = new Date()): Date {
  return daysBefore(monthsAgo(company.historyMonths, now), -1)
}

/**
 * The default start: a week before the last sync; else a week before the
 * newest row the company's accounts hold (from uploads); else three months back.
 */
export async function sourceSummary(company: SyncCompany, now = new Date()): Promise<SourceSummary> {
  const last = await prisma.syncLink.findFirst({
    where: { company: company.id, lastSyncedAt: { not: null } },
    orderBy: { lastSyncedAt: 'desc' },
    select: { lastSyncedAt: true },
  })
  let from: Date
  if (last?.lastSyncedAt) {
    from = daysBefore(last.lastSyncedAt, OVERLAP_DAYS)
  } else {
    const where = { account: { kind: company.kind, provider: company.provider, archived: false } }
    const newest =
      company.kind === 'BANK'
        ? (await prisma.bankTransaction.findFirst({ where, orderBy: { date: 'desc' }, select: { date: true } }))?.date
        : (await prisma.creditCardTransaction.findFirst({ where, orderBy: { transactionDate: 'desc' }, select: { transactionDate: true } }))
            ?.transactionDate
    // A card's installments keep their purchase date, so cards reach a month further back
    from = newest ? daysBefore(newest, company.kind === 'BANK' ? OVERLAP_DAYS : OVERLAP_DAYS + 30) : monthsAgo(FIRST_SYNC_MONTHS, now)
  }
  const earliest = earliestStart(company, now)
  if (from < earliest) from = earliest
  return { lastSyncedAt: last?.lastSyncedAt?.toISOString() ?? null, defaultStart: localDay(from), earliest: localDay(earliest) }
}

export type LinkAction = { externalAccount: string } & (
  | { action: 'link'; accountId: string }
  | { action: 'create' }
  | { action: 'ignore' }
)

/** A site account no link exists for yet, with the Tazrim account it most likely is. */
export interface UnknownAccount {
  externalAccount: string
  /** What the sheet shows: a card's last four digits, else the account number */
  label: string
  rows: number
  suggestedAccountId: string | null
}

export interface Candidate {
  id: string
  displayName: string
  cardLastFour: string | null
  provider: string
}

/** Accounts a site account can be linked to: the company's own (its provider and kind), not archived (ENG-102). */
export async function linkCandidates(company: SyncCompany): Promise<Candidate[]> {
  return prisma.account.findMany({
    where: { kind: company.kind, provider: company.provider, archived: false },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, displayName: true, cardLastFour: true, provider: true },
  })
}

/**
 * The likely match: a card with the same last four digits, else the company's
 * only card that has no digits yet; a bank's only account.
 */
export function suggestAccount(
  company: SyncCompany,
  externalAccount: string,
  accounts: Candidate[]
): string | null {
  if (company.kind === 'CREDIT_CARD') {
    const four = lastFour(externalAccount)
    const same = accounts.find(a => four && a.cardLastFour === four)
    if (same) return same.id
    const own = accounts.filter(a => a.provider === company.provider)
    return own.length === 1 && !own[0].cardLastFour ? own[0].id : null
  }
  const own = accounts.filter(a => a.provider === company.provider)
  return own.length === 1 ? own[0].id : null
}

export async function findLinks(company: SyncCompany, externals: string[]) {
  return prisma.syncLink.findMany({ where: { company: company.id, externalAccount: { in: externals } } })
}

/** Saves the person's answers. "create" adds an account named after the company (and the card's digits). */
export async function saveLinks(company: SyncCompany, actions: LinkAction[]): Promise<void> {
  for (const a of actions) {
    let accountId: string | null = null
    if (a.action === 'link') {
      const target = await prisma.account.findFirst({ where: { id: a.accountId, kind: company.kind, provider: company.provider } })
      if (!target) throw new Error('INVALID_ACCOUNT')
      accountId = target.id
    } else if (a.action === 'create') {
      const four = company.kind === 'CREDIT_CARD' ? lastFour(a.externalAccount) : ''
      const created = await createAccount({
        kind: company.kind,
        provider: company.provider,
        displayName: four ? `${company.label} ${four}` : company.label,
        ...(four.length === 4 ? { cardLastFour: four } : {}),
      })
      accountId = created.id
    }
    const data = { accountId, ignored: a.action === 'ignore' }
    await prisma.syncLink.upsert({
      where: { company_externalAccount: { company: company.id, externalAccount: a.externalAccount } },
      create: { company: company.id, externalAccount: a.externalAccount, ...data },
      update: data,
    })
  }
}

export interface AccountResult {
  accountId: string
  displayName: string
  created: number
  skipped: number
  /** Of `skipped`: rows an uploaded file has under other wording, matched by day and amount */
  skippedByAmount: number
  /** Rows already there (from uploaded files) whose empty אסמכתא or notes the site filled in (ENG-103) */
  filled: number
  pending: number
  /** The oldest settled transaction the site returned, YYYY-MM-DD; null when none */
  oldest: string | null
  /** Banks: the worked-out balance disagrees with an uploaded statement's on this day */
  balanceMismatch?: BalanceMismatch
}

/** The file name a sync's rows carry (and its upload-history line): one per company per day. */
export function syncSourceFile(company: SyncCompany, now = new Date()): string {
  return `sync-${company.id}-${localDay(now)}`
}

const refKey = (day: string, ref: string, a: number, b = 0) => `${day}|${ref}|${a.toFixed(2)}|${b.toFixed(2)}`

/**
 * Rows the account already holds under the same reference (the bank's
 * אסמכתא, the issuer's voucher) on the same day and amount: the same
 * transaction even when the site words its description differently from
 * the exported file. Left out before the usual de-dup runs.
 */
async function dropKnownReferences<T extends ParsedBankTransaction | ParsedCCTransaction>(
  account: Pick<Account, 'id' | 'kind'>,
  rows: T[]
): Promise<{ rows: T[]; dropped: number; matched: Match<T, Known>[] }> {
  const withRef = rows.filter(r => r.reference)
  if (!withRef.length) return { rows, dropped: 0, matched: [] }
  const keys = new Map<string, Known[]>()
  const add = (k: string, s: Known) => keys.set(k, [...(keys.get(k) ?? []), s])
  const matched: Match<T, Known>[] = []
  /** Kept when no stored row has its key; paired for filling in when exactly one uploaded row does */
  const keep = (r: T, k: string | null) => {
    const hits = k ? keys.get(k) : undefined
    if (!hits) return true
    if (hits.length === 1 && !isSyncedFile(hits[0].sourceFile)) matched.push({ row: r, stored: hits[0] })
    return false
  }
  if (account.kind === 'BANK') {
    const bank = withRef as ParsedBankTransaction[]
    const times = bank.map(r => r.date.getTime())
    const stored = await prisma.bankTransaction.findMany({
      where: { accountId: account.id, reference: { not: '' }, date: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) } },
      select: { id: true, date: true, reference: true, debit: true, credit: true, note: true, sourceFile: true },
    })
    for (const s of stored) add(refKey(localDay(s.date), s.reference, s.debit, s.credit), s)
    const kept = rows.filter(r => {
      const b = r as ParsedBankTransaction
      return keep(r, b.reference ? refKey(localDay(b.date), b.reference, b.debit, b.credit) : null)
    })
    return { rows: kept, dropped: rows.length - kept.length, matched }
  }
  const card = withRef as ParsedCCTransaction[]
  const times = card.map(r => r.transactionDate.getTime())
  const stored = await prisma.creditCardTransaction.findMany({
    where: {
      accountId: account.id,
      reference: { not: '' },
      transactionDate: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) },
    },
    select: { id: true, transactionDate: true, reference: true, chargedAmount: true, notes: true, sourceFile: true },
  })
  for (const s of stored) add(refKey(localDay(s.transactionDate), s.reference, s.chargedAmount), s)
  const kept = rows.filter(r => {
    const c = r as ParsedCCTransaction
    return keep(r, c.reference ? refKey(localDay(c.transactionDate), c.reference, c.chargedAmount) : null)
  })
  return { rows: kept, dropped: rows.length - kept.length, matched }
}

/** A stored row a fetched one matched: enough to fill in what it lacks */
type Known = { id: string; reference: string; note?: string; notes?: string | null; sourceFile: string }

/**
 * Fills in the empty אסמכתא and notes of uploaded rows the sync matched
 * (ENG-103), in one write. Returns how many rows changed.
 */
async function fillMatched(kind: 'bank' | 'card', matched: Match<ParsedBankTransaction | ParsedCCTransaction, Known>[]): Promise<number> {
  const updates = matched.flatMap(({ row, stored }) => {
    const data =
      kind === 'bank'
        ? fillBank(row as ParsedBankTransaction, { reference: stored.reference, note: stored.note ?? '' })
        : fillCard(row as ParsedCCTransaction, { reference: stored.reference, notes: stored.notes ?? '' })
    if (!data) return []
    return [
      kind === 'bank'
        ? prisma.bankTransaction.update({ where: { id: stored.id }, data })
        : prisma.creditCardTransaction.update({ where: { id: stored.id }, data }),
    ]
  })
  if (updates.length) await prisma.$transaction(updates)
  return updates.length
}

/** The stored balance on the last row before `day`, to carry a bank's balance forward from. */
async function balanceBefore(accountId: string, day: Date): Promise<number | undefined> {
  const row = await prisma.bankTransaction.findFirst({
    where: { accountId, date: { lt: day } },
    orderBy: [{ date: 'desc' }],
    select: { balance: true },
  })
  return row?.balance
}

/** The account's stored rows over the days the fetched rows cover. */
async function storedBankRows(accountId: string, rows: ParsedBankTransaction[]) {
  if (!rows.length) return []
  const times = rows.map(r => r.date.getTime())
  return prisma.bankTransaction.findMany({
    where: { accountId, date: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) } },
    select: { id: true, date: true, originalDescription: true, debit: true, credit: true, balance: true, reference: true, note: true, sourceFile: true },
  })
}

async function storedCardRows(accountId: string, rows: ParsedCCTransaction[]) {
  if (!rows.length) return []
  const times = rows.map(r => r.transactionDate.getTime())
  return prisma.creditCardTransaction.findMany({
    where: { accountId, transactionDate: { gte: new Date(Math.min(...times)), lte: new Date(Math.max(...times)) } },
    select: {
      id: true,
      transactionDate: true,
      billingDate: true,
      originalMerchantName: true,
      chargedAmount: true,
      reference: true,
      notes: true,
      sourceFile: true,
    },
  })
}

/**
 * Stores every linked, not ignored account of the scrape and stamps its link.
 * Each account is its own short write, like one uploaded file.
 */
export async function storeScrape(company: SyncCompany, scraped: ScrapedAccount[], now = new Date()): Promise<AccountResult[]> {
  const sourceFile = syncSourceFile(company, now)
  const links = await findLinks(
    company,
    scraped.map(a => a.accountNumber)
  )
  const results: AccountResult[] = []
  for (const site of scraped) {
    const link = links.find(l => l.externalAccount === site.accountNumber)
    if (!link || link.ignored || !link.accountId) continue
    const account = await prisma.account.findUnique({ where: { id: link.accountId } })
    if (!account) continue

    let stored: ImportResult
    let pending: number
    let oldest: Date | null = null
    let byAmount = 0
    let filled = 0
    let mismatch: BalanceMismatch | null = null
    if (company.kind === 'BANK') {
      const first = site.txns.filter(t => t.status !== 'pending').map(t => new Date(t.date)).sort((a, b) => +a - +b)[0]
      const anchor = typeof site.balance === 'number' || !first ? undefined : await balanceBefore(account.id, first)
      const mapped = mapBankAccount(site, sourceFile, anchor)
      oldest = mapped.rows[0]?.date ?? null
      const { rows, dropped, matched } = await dropKnownReferences(account, mapped.rows)
      const nearby = await storedBankRows(account.id, mapped.rows)
      mismatch = balanceMismatch(mapped.rows, nearby)
      const loose = matchBankByDayAndAmount(rows, nearby)
      byAmount = loose.dropped
      pending = mapped.pending
      filled = await fillMatched('bank', [...matched, ...loose.matched])
      stored = await storeRows(account, { ok: true, kind: 'bank', rows: loose.keep }, sourceFile, {})
      if (stored.ok) stored = { ...stored, skipped: stored.skipped + dropped + byAmount }
    } else {
      const mapped = mapCardAccount(site)
      oldest = mapped.rows.reduce<Date | null>((a, r) => (!a || r.transactionDate < a ? r.transactionDate : a), null)
      const { rows, dropped, matched } = await dropKnownReferences(account, mapped.rows)
      const loose = matchCardByDayAndAmount(rows, await storedCardRows(account.id, rows))
      byAmount = loose.dropped
      pending = mapped.pending
      filled = await fillMatched('card', [...matched, ...loose.matched])
      stored = await storeRows(account, { ok: true, kind: 'card', rows: loose.keep }, sourceFile, {})
      if (stored.ok) stored = { ...stored, skipped: stored.skipped + dropped + byAmount }
    }
    if (!stored.ok) throw new Error(stored.code)
    await prisma.syncLink.update({ where: { id: link.id }, data: { lastSyncedAt: now } })
    results.push({
      accountId: account.id,
      displayName: account.displayName,
      created: stored.created,
      skipped: stored.skipped,
      skippedByAmount: byAmount,
      filled,
      pending,
      oldest: oldest ? localDay(oldest) : null,
      ...(mismatch ? { balanceMismatch: mismatch } : {}),
    })
  }
  return results
}
