/**
 * Global transaction search (ENG-42): one query over every bank account and
 * card, every year. Parsing and the where builders live in lib/search/query.ts.
 *
 * Paging is a keyset cursor (see encodeCursor): each page reads at most
 * limit+1 rows from each table with the cursor condition, merges them in JS
 * and keeps the first `limit`. That is exact for a merged order and never
 * scans pages already shown, which an offset over two tables could not do.
 * Text matching (LIKE '%term%') scans the tables anyway; at personal-finance
 * sizes (thousands of rows) that is a few ms, so no new index or migration.
 */
import { prisma } from './client'
import { manualLabels } from './manual-recurring'
import { uncategorizedContext } from './uncategorized'
import {
  buildBankWhere,
  buildCardWhere,
  compareResults,
  encodeCursor,
  hasCriteria,
  splitTerms,
  type AliasMatch,
  type SearchFilters,
  type SearchPage,
  type SearchResult,
} from '../search/query'

export type { SearchFilters, SearchPage, SearchResult } from '../search/query'

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** For each term, the alias rules whose display name contains it (case-insensitive in JS, so Latin of any kind folds). */
async function aliasMatchesFor(terms: string[]): Promise<AliasMatch[][]> {
  if (!terms.length) return []
  const aliases = await prisma.transactionAlias.findMany({
    select: { provider: true, originalName: true, displayName: true },
  })
  return terms.map(term => {
    const t = term.toLowerCase()
    return aliases
      .filter(a => a.displayName.toLowerCase().includes(t))
      .map(a => ({ provider: a.provider, originalName: a.originalName }))
  })
}

export async function searchTransactions(filters: SearchFilters): Promise<SearchPage> {
  if (!hasCriteria(filters) || filters.amountInvalid) return { results: [], nextCursor: null, total: 0 }

  const [aliasMatches, uncategorized] = await Promise.all([
    aliasMatchesFor(splitTerms(filters.text)),
    filters.uncategorized ? uncategorizedContext() : undefined,
  ])
  const { cursor: _cursor, ...withoutCursor } = filters
  const bankWhere = buildBankWhere(filters, aliasMatches, uncategorized)
  const cardWhere = buildCardWhere(filters, aliasMatches, uncategorized)
  const bankCountWhere = buildBankWhere(withoutCursor, aliasMatches, uncategorized)
  const cardCountWhere = buildCardWhere(withoutCursor, aliasMatches, uncategorized)
  const take = filters.limit + 1

  const [bankRows, cardRows, bankTotal, cardTotal, accounts] = await Promise.all([
    bankWhere
      ? prisma.bankTransaction.findMany({ where: bankWhere, orderBy: [{ date: 'desc' }, { id: 'desc' }], take })
      : Promise.resolve([]),
    prisma.creditCardTransaction.findMany({
      where: cardWhere,
      orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }],
      take,
    }),
    bankCountWhere ? prisma.bankTransaction.count({ where: bankCountWhere }) : Promise.resolve(0),
    prisma.creditCardTransaction.count({ where: cardCountWhere }),
    prisma.account.findMany({ select: { id: true, displayName: true } }),
  ])

  const names = new Map(accounts.map(a => [a.id, a.displayName]))

  const merged: SearchResult[] = [
    ...bankRows.map(
      (tx): SearchResult => ({
        id: tx.id,
        source: 'bank',
        accountId: tx.accountId,
        accountName: names.get(tx.accountId) ?? '',
        date: ymd(tx.date),
        dateMs: tx.date.getTime(),
        description: tx.description,
        ...(tx.originalDescription !== tx.description ? { originalDescription: tx.originalDescription } : {}),
        amount: tx.debit - tx.credit,
        ...(tx.category ? { category: tx.category } : {}),
        ...(tx.note ? { note: tx.note } : {}),
        ...(tx.reference ? { reference: tx.reference } : {}),
        ignored: tx.ignored,
      })
    ),
    ...cardRows.map(
      (tx): SearchResult => ({
        id: tx.id,
        source: 'card',
        accountId: tx.accountId,
        accountName: names.get(tx.accountId) ?? '',
        date: ymd(tx.transactionDate),
        dateMs: tx.transactionDate.getTime(),
        description: tx.merchantName,
        ...(tx.originalMerchantName !== tx.merchantName ? { originalDescription: tx.originalMerchantName } : {}),
        amount: tx.chargedAmount,
        category: tx.categoryOverride ?? tx.category,
        ...(tx.notes ? { note: tx.notes } : {}),
        ...(tx.reference ? { reference: tx.reference } : {}),
        ignored: tx.ignored,
      })
    ),
  ].sort(compareResults)

  const results = merged.slice(0, filters.limit)
  // Rows a manual recurring series holds carry its name (ENG-71)
  const labels = results.length ? await manualLabels([...new Set(results.map(r => r.accountId))]) : new Map<string, string>()
  for (const r of results) {
    const label = labels.get(r.id)
    if (label) r.recurringLabel = label
  }
  const last = results[results.length - 1]
  const nextCursor =
    merged.length > filters.limit && last
      ? encodeCursor({ dateMs: last.dateMs, source: last.source, id: last.id })
      : null

  return { results, nextCursor, total: bankTotal + cardTotal }
}

/** Every category a card row (override first) or a bank row currently has, sorted, for the filter. */
export async function listSearchCategories(): Promise<string[]> {
  const [rows, bankRows] = await Promise.all([
    prisma.creditCardTransaction.findMany({
      select: { category: true, categoryOverride: true },
      distinct: ['category', 'categoryOverride'],
    }),
    prisma.bankTransaction.findMany({ where: { category: { not: null } }, select: { category: true }, distinct: ['category'] }),
  ])
  const set = new Set([...rows.map(r => r.categoryOverride ?? r.category), ...bankRows.map(r => r.category!)].filter(Boolean))
  return [...set].sort((a, b) => a.localeCompare(b, 'he'))
}
