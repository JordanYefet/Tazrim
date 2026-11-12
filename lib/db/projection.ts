// lib/db/projection.ts
import { prisma } from './client'
import { listAccounts } from './accounts'
import { getRecurringSeries } from './recurring'
import { getCushion } from './settings'
import { combinedBalance, type BalancePoint } from '../insights/combined-balance'
import { isCardPaymentRow } from '../insights/bank-categories'
import { fmt, toDay } from '../insights/recurring'
import {
  PAST_MONTHS,
  WINDOW_MONTHS,
  addMonths,
  monthKey,
  projectBalance,
  type Projection,
  type ProjectionSeries,
} from '../insights/projection'

export type ProjectionPage = Projection & {
  /** provider and colour draw the bank's face on its filter pill */
  banks: { id: string; displayName: string; provider: string; color: string | null }[]
  /** the bank shown alone; null = every bank combined */
  accountId: string | null
}

const day = (d: Date) => fmt(toDay(d))
const firstOf = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1)
}

/**
 * The projection (ENG-87) of every bank combined, or of one bank and the cards
 * it pays (Account.payerAccountId). An unknown account id shows every bank.
 */
export async function getProjection(params: { accountId?: string; today?: Date } = {}): Promise<ProjectionPage> {
  const today = params.today ?? new Date()
  const [bankAccounts, cardAccounts, cushion] = await Promise.all([
    listAccounts({ kind: 'BANK' }),
    listAccounts({ kind: 'CREDIT_CARD' }),
    getCushion(),
  ])
  const banks = bankAccounts.map(a => ({ id: a.id, displayName: a.displayName, provider: a.provider, color: a.color }))
  const accountId = params.accountId && banks.some(b => b.id === params.accountId) ? params.accountId : null
  const scope = accountId ? [accountId] : banks.map(b => b.id)
  const cardIds = cardAccounts.filter(c => (accountId ? c.payerAccountId === accountId : true)).map(c => c.id)
  const page = { banks, accountId }

  // Latest balance of each bank: ignored rows still carry the bank's running balance
  const latest = (
    await Promise.all(
      scope.map(id =>
        prisma.bankTransaction.findFirst({ where: { accountId: id }, orderBy: { date: 'desc' }, select: { date: true, balance: true } })
      )
    )
  ).filter((r): r is { date: Date; balance: number } => r !== null)
  if (latest.length === 0) return { insufficient: true, completeMonths: 0, ...page }
  const lastDate = latest.reduce((a, r) => (r.date > a ? r.date : a), latest[0].date)
  const start = { balance: Math.round(latest.reduce((a, r) => a + r.balance, 0) * 100) / 100, date: day(lastDate) }
  const windowStart = firstOf(addMonths(monthKey(start.date), -WINDOW_MONTHS))

  // Each bank's last balance before the window: one idle through it still counts
  const beforeWindow = new Map<string, number>()
  await Promise.all(
    scope.map(async id => {
      const r = await prisma.bankTransaction.findFirst({ where: { accountId: id, date: { lt: windowStart } }, orderBy: { date: 'desc' }, select: { balance: true } })
      if (r) beforeWindow.set(id, r.balance)
    })
  )

  const [bankRows, cardRows, balanceRows, overview] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { accountId: { in: scope }, ignored: false, date: { gte: windowStart } },
      select: { id: true, date: true, debit: true, credit: true, category: true, description: true, originalDescription: true },
    }),
    prisma.creditCardTransaction.findMany({
      where: { accountId: { in: cardIds }, ignored: false, billingDate: { gte: windowStart } },
      select: { id: true, billingDate: true, chargedAmount: true, category: true, categoryOverride: true },
    }),
    prisma.bankTransaction.findMany({
      where: { accountId: { in: scope }, date: { gte: windowStart } },
      orderBy: { date: 'desc' },
      select: { accountId: true, date: true, balance: true },
    }),
    // Judged as of the latest data, not the clock: stale data must not end every series
    getRecurringSeries({ accountId: [...scope, ...cardIds], today: lastDate }),
  ])

  // The detector leaves bank series without a category: take the latest one among its own rows
  const bankCategory = new Map(bankRows.map(r => [r.id, { date: r.date, category: r.category }]))
  const categoryOf = (ids: string[]) =>
    ids
      .map(id => bankCategory.get(id))
      .filter((r): r is { date: Date; category: string } => !!r?.category)
      .sort((a, b) => b.date.getTime() - a.date.getTime())[0]?.category ?? null

  const series: ProjectionSeries[] = overview.series.map(s => ({
    key: s.key,
    name: s.name,
    source: s.source,
    cadence: s.cadence,
    latestAmount: s.latestAmount,
    monthlyAmount: s.monthlyAmount,
    nextDate: s.nextDate,
    active: s.active,
    dismissed: s.status === 'dismissed',
    isCardPayment: s.isCardPayment,
    isInstallment: s.isInstallment,
    transactionIds: s.transactionIds,
    category: s.category ?? categoryOf(s.transactionIds),
  }))

  const projection = projectBalance({
    today: day(today),
    cushion,
    start,
    bank: bankRows.map(r => ({
      id: r.id,
      date: day(r.date),
      debit: r.debit,
      credit: r.credit,
      category: r.category,
      isCardPayment: isCardPaymentRow(r),
    })),
    cards: cardRows.map(r => ({ id: r.id, billingDate: day(r.billingDate), amount: r.chargedAmount, category: r.categoryOverride ?? r.category })),
    series,
    // The chart draws the last months only, though the rows reach back the whole window
    past: monthEnds(balanceRows, scope, beforeWindow).slice(-(PAST_MONTHS + 1)),
  })
  return { ...projection, ...page }
}

/** Combined month-end balances, oldest first, from rows newest first */
function monthEnds(rows: { accountId: string; date: Date; balance: number }[], scope: string[], before: Map<string, number>): { month: string; balance: number }[] {
  const perAccount = new Map<string, BalancePoint[]>(scope.map(id => [id, []]))
  for (const r of rows) {
    const points = perAccount.get(r.accountId) ?? []
    points.push({ date: day(r.date), balance: r.balance })
    perAccount.set(r.accountId, points)
  }
  const combined = combinedBalance(scope.map(id => perAccount.get(id) ?? []), scope.map(id => before.get(id)))
  const out = new Map<string, number>()
  for (const p of combined) if (!out.has(monthKey(p.date))) out.set(monthKey(p.date), p.balance)
  return [...out.entries()].map(([month, balance]) => ({ month, balance })).sort((a, b) => a.month.localeCompare(b.month))
}
