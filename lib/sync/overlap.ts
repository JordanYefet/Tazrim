/**
 * Where a sync meets rows that came from uploaded files (ENG-91). The site can
 * word a merchant or a description differently from the exported file, so the
 * usual de-dup (exact text) would let the same transaction in twice. Pure.
 *
 * - matchByDayAndAmount: a fetched row that no stored row matches exactly is
 *   still "already there" when an uploaded row has the same day and amount
 *   (and installment), one-to-one.
 * - balanceMismatch: the bank balance a sync works out, checked against the
 *   real one an uploaded statement carries on a day both have.
 */
import { cardDedupeKey, installmentOf, localDay } from '@/lib/upload/card-dedupe'
import type { ParsedBankTransaction, ParsedCCTransaction } from '@/lib/parsers/types'

export interface StoredBankRow {
  date: Date
  originalDescription: string
  debit: number
  credit: number
  balance: number
  sourceFile: string
}

export interface StoredCardRow {
  transactionDate: Date
  billingDate: Date
  originalMerchantName: string
  chargedAmount: number
  notes: string | null
  sourceFile: string
}

/** Rows an earlier sync stored carry this file name (lib/sync/store.ts syncSourceFile) */
export const isSyncedFile = (sourceFile: string) => sourceFile.startsWith('sync-')

const bankExact = (r: { date: Date; originalDescription: string; debit: number; credit: number }) =>
  `${r.date.getTime()}|${r.originalDescription}|${r.debit}|${r.credit}`
const bankLoose = (r: { date: Date; debit: number; credit: number }) => `${localDay(r.date)}|${r.debit.toFixed(2)}|${r.credit.toFixed(2)}`

const cardLoose = (r: { transactionDate: Date; chargedAmount: number; notes: string | null }) => {
  const inst = installmentOf(r.notes)
  return `${localDay(r.transactionDate)}|${r.chargedAmount.toFixed(2)}|${inst ? `${inst.number}/${inst.of}` : ''}`
}

/**
 * Which fetched rows to leave out as already there under other wording.
 * Exact matches are left to the usual de-dup and use up their stored row
 * first; only uploaded rows (never an earlier sync's, which words things the
 * same) are then matched by day and amount, each once.
 */
function plan<I, S extends { sourceFile: string }>(
  incoming: I[],
  stored: S[],
  exactIn: (r: I) => string,
  exactStored: (r: S) => string,
  looseIn: (r: I) => string,
  looseStored: (r: S) => string
): { keep: I[]; dropped: number } {
  const exactPool = new Map<string, number[]>()
  stored.forEach((s, i) => {
    const k = exactStored(s)
    exactPool.set(k, [...(exactPool.get(k) ?? []), i])
  })
  const used = new Set<number>()
  const unmatched: number[] = []
  incoming.forEach((r, i) => {
    const hit = exactPool.get(exactIn(r))?.shift()
    if (hit === undefined) unmatched.push(i)
    else used.add(hit)
  })

  const loosePool = new Map<string, number[]>()
  stored.forEach((s, i) => {
    if (used.has(i) || isSyncedFile(s.sourceFile)) return
    const k = looseStored(s)
    loosePool.set(k, [...(loosePool.get(k) ?? []), i])
  })
  const drop = new Set<number>()
  for (const i of unmatched) if (loosePool.get(looseIn(incoming[i]))?.shift() !== undefined) drop.add(i)
  return { keep: incoming.filter((_, i) => !drop.has(i)), dropped: drop.size }
}

export function matchBankByDayAndAmount(incoming: ParsedBankTransaction[], stored: StoredBankRow[]) {
  return plan(incoming, stored, bankExact, bankExact, bankLoose, bankLoose)
}

export function matchCardByDayAndAmount(incoming: ParsedCCTransaction[], stored: StoredCardRow[]) {
  return plan(incoming, stored, cardDedupeKey, cardDedupeKey, cardLoose, cardLoose)
}

/** How far a worked-out balance may be from the statement's (rounding) */
const BALANCE_TOLERANCE = 1

export interface BalanceMismatch {
  /** YYYY-MM-DD: the latest day the sync and an uploaded statement share */
  day: string
  /** The worked-out end-of-day balance minus the nearest one the statement has that day */
  difference: number
}

/**
 * On the latest day both have, the sync's end-of-day balance should be one of
 * the balances the uploaded statement shows that day (its rows' order within
 * a day is not known). Null when they agree or share no day.
 */
export function balanceMismatch(incoming: ParsedBankTransaction[], stored: StoredBankRow[]): BalanceMismatch | null {
  const uploaded = stored.filter(s => !isSyncedFile(s.sourceFile))
  const storedDays = new Map<string, number[]>()
  for (const s of uploaded) storedDays.set(localDay(s.date), [...(storedDays.get(localDay(s.date)) ?? []), s.balance])
  const endOfDay = new Map<string, number>()
  for (const r of incoming) endOfDay.set(localDay(r.date), r.balance)
  const shared = [...endOfDay.keys()].filter(d => storedDays.has(d)).sort()
  const day = shared.at(-1)
  if (!day) return null
  const computed = endOfDay.get(day)!
  const nearest = storedDays.get(day)!.reduce((a, b) => (Math.abs(b - computed) < Math.abs(a - computed) ? b : a))
  const difference = Math.round((computed - nearest) * 100) / 100
  return Math.abs(difference) <= BALANCE_TOLERANCE ? null : { day, difference }
}
