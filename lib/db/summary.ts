import { getBankMonthlySummary } from './bank'
import { getCCMonthlySummary } from './cards'
import { listAccounts, PROVIDERS } from './accounts'
import {
  emptyBankMonthly,
  emptyCardMonthly,
  type AccountYearSummary,
  type YearSummary,
} from '../utils/year-summary'

export type { YearSummary, AccountYearSummary } from '../utils/year-summary'

/**
 * A year of monthly bank income/spending and card charges — shared by
 * /api/summary and the server pages.
 *
 * - `bank`: every active bank account, summed.
 * - `cards`: every active card, summed. A breakdown of the bank spending
 *   (which already contains each card's monthly payment), never an extra
 *   deduction.
 * - `byAccount`: the same per account, archived accounts included.
 * - `max`: legacy series for the /cards/max page (every MAX card).
 */
export async function getYearSummary(year: number): Promise<YearSummary> {
  const accounts = await listAccounts({ includeArchived: true })

  const entries = await Promise.all(
    accounts.map(async (a): Promise<[string, AccountYearSummary]> => {
      const info = {
        provider: a.provider,
        displayName: a.displayName,
        cardLastFour: a.cardLastFour,
        archived: a.archived,
      }
      return a.kind === 'BANK'
        ? [a.id, { ...info, kind: 'BANK', monthly: await getBankMonthlySummary(year, a.id) }]
        : [a.id, { ...info, kind: 'CREDIT_CARD', monthly: await getCCMonthlySummary(a.id, year) }]
    })
  )
  const byAccount = Object.fromEntries(entries)

  const bank = emptyBankMonthly()
  const cards = emptyCardMonthly()
  const max = emptyCardMonthly()
  const active = { bank: [] as string[], cards: [] as string[] }

  for (const a of accounts) {
    const s = byAccount[a.id]
    if (s.kind === 'BANK') {
      if (a.archived) continue
      active.bank.push(a.id)
      for (let m = 1; m <= 12; m++) {
        bank[m].income += s.monthly[m].income
        bank[m].expense += s.monthly[m].expense
      }
    } else {
      if (a.provider === PROVIDERS.MAX) for (let m = 1; m <= 12; m++) max[m] += s.monthly[m]
      if (a.archived) continue
      active.cards.push(a.id)
      for (let m = 1; m <= 12; m++) cards[m] += s.monthly[m]
    }
  }

  return { bank, cards, max, byAccount, accounts: active }
}

/**
 * Same shape the pages used to get from `fetch(...).json()`: Dates become ISO
 * strings, which is what the client components expect.
 */
export function asJson<T>(value: T) {
  return JSON.parse(JSON.stringify(value))
}
