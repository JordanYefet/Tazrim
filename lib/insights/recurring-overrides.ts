/**
 * Merges saved user decisions (confirm / dismiss / rename) into freshly detected
 * recurring series, and splits the result into the sections the UI shows. Pure.
 */
import { recurringMonthlyTotal, type RecurringSeries } from './recurring'
import type { ManualInfo, ManualRecurringSeries } from './manual-recurring'

export type RecurringStatusValue = 'confirmed' | 'dismissed'

export interface RecurringOverrideInput {
  key: string
  baseKey: string
  status: RecurringStatusValue | null
  displayName: string | null
}

export interface AppliedSeries extends RecurringSeries {
  status: RecurringStatusValue | null
  /** name from the statement, before any rename */
  detectedName: string
  /** key of the override row that matched (may differ from `key` after a base-key fallback) */
  overrideKey: string | null
  /** set on a series the user defined by hand (ENG-71); overrides never apply to it */
  manual?: ManualInfo
}

/** A manual series in the same shape as a detected one with its overrides applied */
export function asApplied(s: ManualRecurringSeries): AppliedSeries {
  return { ...s, detectedName: s.name, status: null, overrideKey: null }
}

/**
 * Exact `key` match first. An override whose key no longer exists still applies
 * through `baseKey` when exactly one detected series has that base key (a merchant
 * whose key gained or lost its amount suffix as other series came and went).
 */
export function applyOverrides(series: RecurringSeries[], overrides: RecurringOverrideInput[]): AppliedSeries[] {
  const byKey = new Map(overrides.map(o => [o.key, o]))
  const keys = new Set(series.map(s => s.key))
  const perBase = new Map<string, number>()
  for (const s of series) perBase.set(s.baseKey, (perBase.get(s.baseKey) ?? 0) + 1)

  const orphansByBase = new Map<string, RecurringOverrideInput>()
  // one per base key; the last in the list wins (callers pass oldest first)
  for (const o of overrides) if (!keys.has(o.key)) orphansByBase.set(o.baseKey, o)

  return series.map(s => {
    const o = byKey.get(s.key) ?? (perBase.get(s.baseKey) === 1 ? orphansByBase.get(s.baseKey) : undefined)
    const displayName = o?.displayName?.trim()
    return {
      ...s,
      name: displayName || s.name,
      detectedName: s.name,
      status: o?.status ?? null,
      overrideKey: o?.key ?? null,
    }
  })
}

export interface RecurringSummary {
  /** active subscriptions and other recurring charges, counted in `total` */
  subscriptions: AppliedSeries[]
  /** active card installment plans */
  installments: AppliedSeries[]
  /** bank debits to card companies: their content is the card series, so never totalled */
  cardPayments: AppliedSeries[]
  /** stopped series (no charge for over ~2 cycles) */
  inactive: AppliedSeries[]
  dismissed: AppliedSeries[]
  /** monthly cost of `subscriptions` */
  total: number
  /** monthly cost of `installments` */
  installmentsTotal: number
}

export function summarizeRecurring(series: AppliedSeries[]): RecurringSummary {
  const kept = series.filter(s => s.status !== 'dismissed')
  const dismissed = series.filter(s => s.status === 'dismissed')
  const cardPayments = kept.filter(s => s.isCardPayment)
  const rest = kept.filter(s => !s.isCardPayment)
  const installments = rest.filter(s => s.active && s.isInstallment)
  return {
    subscriptions: rest.filter(s => s.active && !s.isInstallment),
    installments,
    cardPayments,
    inactive: rest.filter(s => !s.active),
    dismissed,
    total: recurringMonthlyTotal(series, { sources: ['bank', 'card'], excludedKeys: dismissed.map(s => s.key) }),
    installmentsTotal: Math.round(installments.reduce((sum, s) => sum + s.monthlyAmount, 0) * 100) / 100,
  }
}

/**
 * Ids of the transactions that belong to a kept (not dismissed) series, active or
 * not, card payments and installments included: for features that should treat
 * recurring charges differently from one-off spending.
 */
export function recurringTransactionIds(series: AppliedSeries[]): Set<string> {
  return new Set(series.filter(s => s.status !== 'dismissed').flatMap(s => s.transactionIds))
}
