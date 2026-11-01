// Which bank account pays a card company, from the bank's payment rows: the
// suggestion in the add form, the hint in a card's edit window and the
// "looks paid from" line in the accounts list. Pure and client-safe; the rows
// come from lib/db/card-payers.ts.
import { cardPaymentProvider } from '@/lib/insights/card-payment'
import { formatCurrency } from '@/lib/utils/currency'

/** A bank row that may be a card payment (classified here) */
export interface PayerPaymentRow {
  accountId: string
  /** "YYYY-MM-DD", local */
  date: string
  description: string
  debit: number
}

/** One bank account's payments to one card company */
export interface PayerEvidence {
  bankAccountId: string
  /** The card company, as Account.provider (cardPaymentProvider) */
  provider: string
  /** Payment rows in the 12 months up to today */
  count: number
  /** A payment in every month from the year's first one to the last, the last one recent (3 months or more) */
  everyMonth: boolean
  /** "YYYY-MM-DD" of the latest payment, any age */
  lastDate: string
  lastAmount: number
}

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1

/** Every (bank account, card company) pair with payments, from the candidate rows */
export function collectPayerEvidence(rows: readonly PayerPaymentRow[], today: string): PayerEvidence[] {
  // Same day a year ago: rows after it are "the last year"
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`
  const pairs = new Map<string, PayerEvidence & { months: Set<number> }>()
  for (const r of rows) {
    // A refund or a reversed charge isn't a payment
    if (!(r.debit > 0)) continue
    const provider = cardPaymentProvider(r.description)
    if (!provider) continue
    const key = `${r.accountId}|${provider}`
    let e = pairs.get(key)
    if (!e) {
      e = { bankAccountId: r.accountId, provider, count: 0, everyMonth: false, lastDate: '', lastAmount: 0, months: new Set() }
      pairs.set(key, e)
    }
    if (r.date > yearAgo && r.date <= today) {
      e.count++
      e.months.add(monthIndex(r.date))
    }
    // The latest row wins; on one day the larger debit (the card's charge, not a fee)
    if (r.date > e.lastDate || (r.date === e.lastDate && r.debit > e.lastAmount)) {
      e.lastDate = r.date
      e.lastAmount = r.debit
    }
  }
  return [...pairs.values()].map(({ months, ...e }) => {
    const first = Math.min(...months)
    const last = Math.max(...months)
    const recent = monthIndex(today) - last <= 1
    return { ...e, everyMonth: months.size >= 3 && recent && months.size === last - first + 1 }
  })
}

/**
 * A company's payers, most likely first: the most payments in the last year,
 * then the latest payment. Only `eligible` bank accounts when given (the
 * non-archived ones a card can be linked to).
 */
export function rankPayers(evidence: readonly PayerEvidence[], provider: string, eligible?: readonly string[]): PayerEvidence[] {
  return evidence
    .filter(e => e.provider === provider && (!eligible || eligible.includes(e.bankAccountId)))
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate) || a.bankAccountId.localeCompare(b.bankAccountId))
}

/** The bank account a card of this company is most likely paid from, or null when no bank row pays it */
export function suggestPayer(evidence: readonly PayerEvidence[], provider: string, eligible?: readonly string[]): PayerEvidence | null {
  return rankPayers(evidence, provider, eligible)[0] ?? null
}

/** One bank account's payments to a company, if any */
export function payerEvidenceFor(evidence: readonly PayerEvidence[], provider: string, bankAccountId: string): PayerEvidence | null {
  return evidence.find(e => e.provider === provider && e.bankAccountId === bankAccountId) ?? null
}

// Hebrew prefixes join a Hebrew word; before Latin text or digits they take a maqaf
const joined = (prefix: string, name: string) => (/^[֐-׿]/.test(name) ? prefix + name : `${prefix}־${name}`)
/** "בבנק לאומי", "ב־Leumi" */
export const inName = (name: string) => joined('ב', name)
/** "למקס", "ל־diners" */
export const toName = (name: string) => joined('ל', name)
/** "מבנק לאומי" */
export const fromName = (name: string) => joined('מ', name)

/** "10.10", with the year when it isn't this year's */
export function shortDate(date: string, today: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${d}.${m}${date.slice(0, 4) === today.slice(0, 4) ? '' : `.${y}`}`
}

const isolate = (text: string) => `\u2068${text}\u2069`

/**
 * Why a bank account was suggested, a clause the caller ends:
 * "בבנק לאומי יש תשלומים למקס כל חודש (האחרון 10.10, ‏3,043.12 ₪)".
 */
export function payerReason(e: PayerEvidence, bankName: string, companyName: string, today: string): string {
  // Each figure isolated (FSI…PDI), so the date and the amount keep their own order in the Hebrew sentence
  const last = `האחרון ${isolate(shortDate(e.lastDate, today))}, ${isolate(formatCurrency(e.lastAmount))}`
  const where = inName(bankName)
  const company = toName(companyName)
  if (e.everyMonth) return `${where} יש תשלומים ${company} כל חודש (${last})`
  if (e.count === 1) return `${where} נמצא תשלום אחד ${company} בשנה האחרונה (${last})`
  if (e.count > 1) return `${where} נמצאו ${e.count.toLocaleString('he-IL')} תשלומים ${company} בשנה האחרונה (${last})`
  return `${where} נמצאו תשלומים ${company}, ${last}`
}

/** The edit window's hint under the chosen payer: "12 תשלומים למקס נמצאו בחשבון הזה בשנה האחרונה." */
export function payerCountHint(e: PayerEvidence, companyName: string, today: string): string {
  const company = toName(companyName)
  if (e.count === 1) return `תשלום אחד ${company} נמצא בחשבון הזה בשנה האחרונה.`
  if (e.count > 1) return `${e.count.toLocaleString('he-IL')} תשלומים ${company} נמצאו בחשבון הזה בשנה האחרונה.`
  return `התשלום האחרון ${company} מהחשבון הזה היה ב־${shortDate(e.lastDate, today)}.`
}
