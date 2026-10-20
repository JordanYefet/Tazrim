import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/client'
import { PERIOD_COOKIE, resolvePeriod, type PeriodParams, type ResolvedPeriod } from './period'

/** Whether any bank row or card charge (by billing month) falls in `year`. */
export async function yearHasData(year: number): Promise<boolean> {
  const range = { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) }
  const [bank, card] = await Promise.all([
    prisma.bankTransaction.findFirst({ where: { date: range }, select: { id: true } }),
    prisma.creditCardTransaction.findFirst({ where: { billingDate: range }, select: { id: true } }),
  ])
  return !!(bank || card)
}

/**
 * The period a server page (or route handler) shows: URL params, then the
 * remembered cookie, then the current year. Every page that reads the period
 * goes through here, so they all agree.
 */
export async function getPeriod(params: PeriodParams): Promise<ResolvedPeriod> {
  const jar = await cookies()
  return resolvePeriod(params, jar.get(PERIOD_COOKIE)?.value, { yearHasData })
}

/**
 * A page's search params with the period resolved into them: `year` always
 * set, `month` set for one month and absent for all months. Pages read
 * `params.year` / `params.month` as before.
 */
export async function withResolvedPeriod<T extends { year?: string; month?: string }>(
  params: T
): Promise<Omit<T, 'year' | 'month'> & { year: string; month?: string }> {
  const p = await getPeriod(params)
  return { ...params, year: String(p.year), month: p.month ? String(p.month) : undefined }
}
