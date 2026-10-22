import type { RecurringStatus } from '@prisma/client'
import { prisma } from './client'
import { accountWhere, type AccountFilter } from './accounts'
import { detectRecurring, fromBankRow, fromCardRow } from '../insights/recurring'
import { resolveManualSeries } from '../insights/manual-recurring'
import { listManualSeries } from './manual-recurring'
import {
  applyOverrides,
  asApplied,
  recurringTransactionIds,
  summarizeRecurring,
  type AppliedSeries,
  type RecurringOverrideInput,
  type RecurringStatusValue,
  type RecurringSummary,
} from '../insights/recurring-overrides'

export type { AppliedSeries, RecurringStatusValue }

export interface RecurringOverview extends RecurringSummary {
  /** every detected series with overrides applied (dismissed ones included), and the manual series */
  series: AppliedSeries[]
  /** transaction ids of every kept series, e.g. to exempt recurring charges from anomaly checks */
  transactionIds: Set<string>
  accountNames: Record<string, string>
}

/** What identifies a series for a write: a detected series (or its key fields) */
export interface RecurringTarget {
  key: string
  baseKey: string
  accountId?: string | null
  /** key of the override row that matched it, when that differs from `key` */
  overrideKey?: string | null
}

const TO_DB: Record<RecurringStatusValue, RecurringStatus> = { confirmed: 'CONFIRMED', dismissed: 'DISMISSED' }
const FROM_DB: Record<RecurringStatus, RecurringStatusValue> = { CONFIRMED: 'confirmed', DISMISSED: 'dismissed' }

export async function getRecurringOverrides(): Promise<RecurringOverrideInput[]> {
  const rows = await prisma.recurringSeriesOverride.findMany({ orderBy: { updatedAt: 'asc' } })
  return rows.map(r => ({
    key: r.key,
    baseKey: r.baseKey,
    status: r.status ? FROM_DB[r.status] : null,
    displayName: r.displayName,
  }))
}

/**
 * Detects recurring series on the given account(s) (all bank accounts and cards when
 * `accountId` is undefined) and applies the saved overrides. Ignored rows are left out.
 * Manual series (ENG-71) are resolved first; their transactions are kept out of
 * detection, so no transaction is counted in two series.
 * Without `today`, each account is judged as of its own latest transaction, so an
 * account whose statements stop earlier doesn't look like it stopped paying.
 */
export async function getRecurringSeries(
  params: { accountId?: AccountFilter; today?: Date | string } = {}
): Promise<RecurringOverview> {
  const where = { ignored: false, ...accountWhere(params.accountId) }
  const [bankRows, cardRows, overrides, accounts, manualDefs] = await Promise.all([
    prisma.bankTransaction.findMany({
      where,
      select: { id: true, date: true, description: true, originalDescription: true, debit: true, accountId: true },
    }),
    prisma.creditCardTransaction.findMany({
      where,
      select: {
        id: true,
        transactionDate: true,
        billingDate: true,
        transactionType: true,
        merchantName: true,
        originalMerchantName: true,
        chargedAmount: true,
        category: true,
        categoryOverride: true,
        accountId: true,
      },
    }),
    getRecurringOverrides(),
    prisma.account.findMany({ select: { id: true, displayName: true } }),
    listManualSeries(params.accountId),
  ])

  const transactions = [...bankRows.map(fromBankRow), ...cardRows.map(fromCardRow)]
  const today = params.today !== undefined ? { today: params.today } : {}
  const manual = resolveManualSeries(manualDefs, transactions, today)
  const detected = detectRecurring(transactions, { ...today, exclude: manual.claimed })
  const series = [...applyOverrides(detected, overrides), ...manual.series.map(asApplied)].sort(
    (a, b) => b.monthlyAmount - a.monthlyAmount || a.name.localeCompare(b.name)
  )
  return {
    series,
    ...summarizeRecurring(series),
    transactionIds: recurringTransactionIds(series),
    accountNames: Object.fromEntries(accounts.map(a => [a.id, a.displayName])),
  }
}

async function writeOverride(
  target: RecurringTarget,
  patch: { status?: RecurringStatusValue | null; displayName?: string | null }
) {
  if (patch.status !== undefined && patch.status !== null && !(patch.status in TO_DB)) {
    throw new Error(`Unknown recurring status: ${String(patch.status)}`)
  }
  const displayName = patch.displayName === undefined ? undefined : patch.displayName?.trim() || null

  await prisma.$transaction(async tx => {
    const exact = await tx.recurringSeriesOverride.findUnique({ where: { key: target.key } })
    const matched =
      target.overrideKey && target.overrideKey !== target.key
        ? await tx.recurringSeriesOverride.findUnique({ where: { key: target.overrideKey } })
        : null
    // A row matched through the base key moves onto the current key
    const existing = exact ?? matched
    if (exact && matched) await tx.recurringSeriesOverride.delete({ where: { id: matched.id } })

    const status =
      patch.status !== undefined ? (patch.status ? TO_DB[patch.status] : null) : (existing?.status ?? null)
    const name = displayName !== undefined ? displayName : (existing?.displayName ?? null)

    if (!status && !name) {
      if (existing) await tx.recurringSeriesOverride.delete({ where: { id: existing.id } })
      return
    }
    const data = { key: target.key, baseKey: target.baseKey, accountId: target.accountId ?? null, status, displayName: name }
    if (existing) await tx.recurringSeriesOverride.update({ where: { id: existing.id }, data })
    else await tx.recurringSeriesOverride.create({ data })
  })
}

/** Confirm or dismiss a series; `null` undoes either. */
export async function setRecurringStatus(target: RecurringTarget, status: RecurringStatusValue | null) {
  await writeOverride(target, { status })
}

/** Rename a series; `null` or blank goes back to the detected name. */
export async function renameRecurring(target: RecurringTarget, displayName: string | null) {
  await writeOverride(target, { displayName })
}
