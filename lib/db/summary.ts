import { getBankMonthlySummary } from './bank'
import { getCCMonthlySummary, getMaxCardIds } from './cards'

/**
 * Monthly bank income/expense (every bank account) and MAX charges (every MAX
 * card) for a year — shared by /api/summary and server pages. The card
 * charges are a breakdown of the bank expense, never an extra deduction.
 */
export async function getYearSummary(year: number) {
  const [bank, max] = await Promise.all([
    getBankMonthlySummary(year),
    getMaxCardIds().then(ids => getCCMonthlySummary(ids, year)),
  ])
  return { bank, max }
}

/**
 * Same shape the pages used to get from `fetch(...).json()`: Dates become ISO
 * strings, which is what the client components expect.
 */
export function asJson<T>(value: T) {
  return JSON.parse(JSON.stringify(value))
}
