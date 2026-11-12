/**
 * A category's year (the drill-down behind every category tap): one total, twelve
 * months, the merchants that made it and one month's rows. Bank rows and card charges
 * share the category; the bank's card payment never has one, so the two never overlap.
 * Pure: lib/db/category-year.ts reads the rows.
 */
import { compareResults, type SearchResult } from '@/lib/search/query'
import { monthProgress } from './month-progress'

/** A row of the category: a search result that also knows the month it counts in */
export interface CategoryYearRow extends SearchResult {
  /** 1-12: a card charge's billing month, a bank row's calendar month */
  month: number
}

export interface MerchantSummary {
  name: string
  count: number
  /** The year's total of this merchant in the category (refunds reduce it) */
  total: number
  /** One of its rows, for the merchant's own year (the window) */
  sample: { source: 'bank' | 'card'; id: string }
}

export interface CategoryYearSummary {
  /** The year's total so far (the month in progress included) */
  total: number
  /** month (1-12) -> total; every month present, 0 when nothing */
  months: Record<number, number>
  /** The average over the finished months with data; null before any month has finished */
  average: number | null
  /** How many months the average covers */
  averageMonths: number
  /** total / the year's total of every category, 0..1; null when there is nothing to share */
  share: number | null
  /** The month whose rows are listed: the selected one, else the latest with rows in this category */
  focusMonth: number | undefined
  /** The focus month is this month (its figures are partial) */
  focusInProgress: boolean
  merchants: MerchantSummary[]
  /** The focus month's rows, newest first */
  monthRows: CategoryYearRow[]
}

/** What a row adds to the category: money out for an expense category, money in for an income one */
export function contribution(row: Pick<SearchResult, 'amount'>, kind: 'EXPENSE' | 'INCOME'): number {
  return kind === 'INCOME' ? -row.amount : row.amount
}

/** month (1-12) -> sum of the rows' contributions, every month present */
export function sumByMonth(rows: Pick<CategoryYearRow, 'month' | 'amount'>[], kind: 'EXPENSE' | 'INCOME'): Record<number, number> {
  const months: Record<number, number> = {}
  for (let m = 1; m <= 12; m++) months[m] = 0
  for (const r of rows) if (r.month >= 1 && r.month <= 12) months[r.month] += contribution(r, kind)
  return months
}

/** The merchants of the rows, largest total first, at most `limit` */
export function topMerchants(rows: CategoryYearRow[], kind: 'EXPENSE' | 'INCOME', limit = 5): MerchantSummary[] {
  const byName = new Map<string, MerchantSummary>()
  for (const r of rows) {
    const m = byName.get(r.description)
    if (m) {
      m.count++
      m.total += contribution(r, kind)
    } else {
      byName.set(r.description, { name: r.description, count: 1, total: contribution(r, kind), sample: { source: r.source, id: r.id } })
    }
  }
  return [...byName.values()]
    .sort((a, b) => b.total - a.total || b.count - a.count || a.name.localeCompare(b.name, 'he'))
    .slice(0, limit)
}

export function summarizeCategoryYear(
  rows: CategoryYearRow[],
  opts: {
    kind: 'EXPENSE' | 'INCOME'
    year: number
    /** The selected month (?month=), if any */
    month?: number
    /** The year's total of every category of the same sources (the share's denominator) */
    yearTotal: number
    /** The latest month any category has data in (the average counts up to it) */
    lastDataMonth: number | null
    now?: Date
    merchantLimit?: number
  }
): CategoryYearSummary {
  const { kind, year, yearTotal, lastDataMonth } = opts
  const now = opts.now ?? new Date()
  const months = sumByMonth(rows, kind)
  const total = Object.values(months).reduce((s, v) => s + v, 0)

  // The average: finished months up to the latest with data anywhere, the month in progress left out
  const finished: number[] = []
  for (let m = 1; m <= (lastDataMonth ?? 0); m++) {
    const p = monthProgress(year, m, now)
    if (!p.inProgress && p.day > 0) finished.push(m)
  }
  const average = finished.length ? finished.reduce((s, m) => s + months[m], 0) / finished.length : null

  const own = Object.entries(months).filter(([, v]) => v !== 0).map(([m]) => Number(m))
  const focusMonth = opts.month ?? (own.length ? Math.max(...own) : undefined)

  return {
    total,
    months,
    average,
    averageMonths: finished.length,
    share: yearTotal > 0 ? total / yearTotal : null,
    focusMonth,
    focusInProgress: focusMonth !== undefined && monthProgress(year, focusMonth, now).inProgress,
    merchants: topMerchants(rows, kind, opts.merchantLimit),
    monthRows: focusMonth === undefined ? [] : rows.filter(r => r.month === focusMonth).sort(compareResults),
  }
}

/** One merchant's year (the transaction window's "העסק הזה לאורך השנה") */
export interface MerchantYear {
  name: string
  year: number
  months: Record<number, number>
  total: number
  count: number
}

export function merchantYear(name: string, year: number, rows: Pick<CategoryYearRow, 'month' | 'amount'>[], kind: 'EXPENSE' | 'INCOME'): MerchantYear {
  const months = sumByMonth(rows, kind)
  return { name, year, months, total: Object.values(months).reduce((s, v) => s + v, 0), count: rows.length }
}
