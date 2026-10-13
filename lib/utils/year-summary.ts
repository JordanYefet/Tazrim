/**
 * Types and pure helpers for the year summary (lib/db/summary.ts). No Prisma
 * imports, so client components can use them too.
 *
 * Invariant (ENG-3): bank spending already includes each card's monthly
 * payment. The net is bank income − bank spending; card charges are a
 * breakdown of that spending and are never subtracted again.
 */

export interface BankMonth {
  income: number
  expense: number
}

/** month (1-12) -> value. JSON turns the keys into strings, which index the same way. */
export type BankMonthly = Record<number, BankMonth>
export type CardMonthly = Record<number, number>

interface AccountInfo {
  provider: string
  displayName: string
  cardLastFour: string | null
  /** Archived accounts keep their data here but are left out of the totals. */
  archived: boolean
}

export type AccountYearSummary =
  | (AccountInfo & { kind: 'BANK'; monthly: BankMonthly })
  | (AccountInfo & { kind: 'CREDIT_CARD'; monthly: CardMonthly })

export interface YearSummary {
  /** Income and spending summed over every active bank account. */
  bank: BankMonthly
  /** Charges summed over every active card, whatever the provider. */
  cards: CardMonthly
  /**
   * Legacy: charges on every MAX card, archived ones included — what the
   * /cards/max page shows next to its transaction list. New code uses `cards`.
   */
  max: CardMonthly
  /** Every account, archived ones included, oldest first. */
  byAccount: Record<string, AccountYearSummary>
  /** Ids of the active accounts in each total, oldest first. */
  accounts: { bank: string[]; cards: string[] }
}

export function emptyBankMonthly(): BankMonthly {
  const m: BankMonthly = {}
  for (let i = 1; i <= 12; i++) m[i] = { income: 0, expense: 0 }
  return m
}

export function emptyCardMonthly(): CardMonthly {
  const m: CardMonthly = {}
  for (let i = 1; i <= 12; i++) m[i] = 0
  return m
}

/** One month's value, or the whole year's when `month` is omitted. */
export function monthTotal(monthly: CardMonthly, month?: number): number {
  if (month) return monthly[month] ?? 0
  return Object.values(monthly).reduce((s, v) => s + v, 0)
}

export function bankMonthTotal(monthly: BankMonthly, month?: number): BankMonth {
  if (month) return monthly[month] ?? { income: 0, expense: 0 }
  return Object.values(monthly).reduce(
    (s, m) => ({ income: s.income + m.income, expense: s.expense + m.expense }),
    { income: 0, expense: 0 }
  )
}

/** Bank income − bank spending. Card charges are already inside the spending. */
export function netBalance(summary: Pick<YearSummary, 'bank'>, month?: number): number {
  const { income, expense } = bankMonthTotal(summary.bank, month)
  return income - expense
}

export interface CardShare {
  id: string
  displayName: string
  cardLastFour: string | null
  total: number
}

/** The card total split per active card, in display order. */
export function cardBreakdown(summary: Pick<YearSummary, 'byAccount' | 'accounts'>, month?: number): CardShare[] {
  return summary.accounts.cards.map(id => {
    const a = summary.byAccount[id]
    return {
      id,
      displayName: a.displayName,
      cardLastFour: a.cardLastFour,
      total: a.kind === 'CREDIT_CARD' ? monthTotal(a.monthly, month) : 0,
    }
  })
}

/** Card name for the UI: its display name, plus the last four digits when set. */
export function cardLabel(card: Pick<CardShare, 'displayName' | 'cardLastFour'>): string {
  return card.cardLastFour ? `${card.displayName} (${card.cardLastFour})` : card.displayName
}

/** The `?card=` value if it names an active card, else undefined (= all cards). */
export function resolveCardParam(param: string | undefined, activeCardIds: string[]): string | undefined {
  return param && activeCardIds.includes(param) ? param : undefined
}
