/**
 * A card billed on the same day every month, for files without a billing date
 * (e.g. Isracard's export has none per row): the billing date of each row is
 * worked out from its purchase date.
 *
 * The bill on day `day` covers purchases up to the cycle's closing day
 * (`closesOn`, default `day`): a purchase goes to the first closing day on or
 * after it, then to the first billing day on or after that. So with day 10 and
 * no closing day, 8/10 is billed 10/10 and 15/10 is billed 10/11; closing on
 * the 7th, 8/10 waits for 10/11. A day past the end of a month is that month's
 * last day. Instalments ("תשלום N מתוך M") keep the original purchase date, so
 * payment N is moved N - 1 months.
 */
import { installmentOf } from '@/lib/upload/card-dedupe'

export interface BillingDay {
  /** 1-31: the day of the month the card is billed */
  day: number
  /** 1-31: the last purchase day in a billing cycle; defaults to `day` */
  closesOn?: number
}

/** Day `day` of month `m` (0-based, any integer) of `y`, clamped to the month's last day. */
function onDay(y: number, m: number, day: number): Date {
  const last = new Date(y, m + 1, 0).getDate()
  return new Date(y, m, Math.min(day, last))
}

/** The first date on or after `from` that falls on `day` (clamped per month). */
function nextOn(from: Date, day: number): Date {
  const same = onDay(from.getFullYear(), from.getMonth(), day)
  return same >= from ? same : onDay(from.getFullYear(), from.getMonth() + 1, day)
}

export function billingDateByDay(purchase: Date, rule: BillingDay, notes?: string | null): Date {
  const start = new Date(purchase.getFullYear(), purchase.getMonth(), purchase.getDate())
  const closed = nextOn(start, rule.closesOn ?? rule.day)
  const billed = nextOn(closed, rule.day)
  const n = installmentOf(notes)?.number ?? 1
  return n > 1 ? onDay(billed.getFullYear(), billed.getMonth() + n - 1, rule.day) : billed
}
