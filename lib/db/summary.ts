import { getBankMonthlySummary } from './bank'
import { getCCMonthlySummary } from './cards'

/** Monthly bank income/expense and MAX charges for a year — shared by /api/summary and server pages */
export async function getYearSummary(year: number) {
  const [bank, max] = await Promise.all([
    getBankMonthlySummary(year),
    getCCMonthlySummary('MAX', year),
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
