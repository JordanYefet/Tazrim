/**
 * What a bank or card company's site returned (israeli-bank-scrapers'
 * accounts and transactions) turned into the rows an uploaded file gives
 * (lib/parsers/types.ts), so a sync stores through the same path and de-dup
 * as an upload (ENG-91). Pure: no database, no scraper package.
 */
import type { ParsedBankTransaction, ParsedCCTransaction } from '@/lib/parsers/types'

/** The fields of israeli-bank-scrapers' Transaction this module reads. */
export interface ScrapedTransaction {
  type: 'normal' | 'installments' | string
  identifier?: string | number
  /** ISO date of the purchase or value day */
  date: string
  /** ISO date the card company charges it on */
  processedDate: string
  originalAmount: number
  originalCurrency: string
  /** Negative for money going out */
  chargedAmount: number
  chargedCurrency?: string
  description: string
  memo?: string
  status: 'completed' | 'pending' | string
  installments?: { number: number; total: number }
  category?: string
}

export interface ScrapedAccount {
  accountNumber: string
  /** The account's balance now (banks) */
  balance?: number
  txns: ScrapedTransaction[]
}

const ZONE = 'Asia/Jerusalem'
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * The Israeli calendar day of an ISO date, as local midnight (the parsers'
 * convention, so the de-dup keys and month views line up with uploads).
 */
export function israelDay(iso: string): Date | null {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const [y, m, day] = dayFormat.format(d).split('-').map(Number)
  return new Date(y, m - 1, day)
}

const CURRENCIES: Record<string, string> = { ILS: '₪', NIS: '₪', '₪': '₪', USD: '$', $: '$', EUR: '€', '€': '€', GBP: '£' }

export function currencySymbol(code: string | undefined): string {
  const c = (code ?? '').trim()
  return CURRENCIES[c.toUpperCase()] ?? CURRENCIES[c] ?? (c || '₪')
}

/** "תשלום 2 מתוך 3", the wording the card files use (lib/upload/card-dedupe.ts reads it back). */
export function installmentNote(inst: ScrapedTransaction['installments']): string {
  return inst && inst.total > 1 ? `תשלום ${inst.number} מתוך ${inst.total}` : ''
}

/** A card's last four digits from the account number the site reports. */
export function lastFour(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, '')
  return digits.slice(-4)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export interface MappedAccount<T> {
  externalAccount: string
  rows: T[]
  /** Transactions the site lists but has not settled yet, left for a later sync */
  pending: number
  /** Rows whose date could not be read, left out */
  invalid: number
}

/**
 * Bank rows, oldest first. The site gives no balance per row, so it is worked
 * out: back from the account's balance now when the site reports it, else
 * forward from `anchor` (the stored balance just before the first row).
 * Without either it is 0 and `balanceKnown` is false.
 */
export function mapBankAccount(
  account: ScrapedAccount,
  sourceFile: string,
  anchor?: number
): MappedAccount<ParsedBankTransaction> & { balanceKnown: boolean } {
  let pending = 0
  let invalid = 0
  const dated: { tx: ScrapedTransaction; date: Date; i: number }[] = []
  account.txns.forEach((tx, i) => {
    if (tx.status === 'pending') return void pending++
    const date = israelDay(tx.date)
    if (!date) return void invalid++
    dated.push({ tx, date, i })
  })
  dated.sort((a, b) => a.date.getTime() - b.date.getTime() || a.i - b.i)

  const amounts = dated.map(d => round2(d.tx.chargedAmount))
  const balances: number[] = new Array(dated.length).fill(0)
  let balanceKnown = true
  if (typeof account.balance === 'number' && dated.length) {
    balances[dated.length - 1] = round2(account.balance)
    for (let k = dated.length - 1; k > 0; k--) balances[k - 1] = round2(balances[k] - amounts[k])
  } else if (typeof anchor === 'number') {
    let b = anchor
    amounts.forEach((a, k) => (balances[k] = b = round2(b + a)))
  } else {
    balanceKnown = dated.length === 0
  }

  const rows = dated.map(({ tx, date }, k): ParsedBankTransaction => {
    const amount = amounts[k]
    return {
      date,
      originalDescription: tx.description.trim(),
      description: tx.description.trim(),
      debit: amount < 0 ? -amount : 0,
      credit: amount > 0 ? amount : 0,
      balance: balances[k],
      note: (tx.memo ?? '').trim(),
      reference: tx.identifier === undefined || tx.identifier === null ? '' : String(tx.identifier),
      sourceFile,
    }
  })
  return { externalAccount: account.accountNumber, rows, pending, invalid, balanceKnown }
}

/** Card rows: charges positive, refunds negative, as the mapped card files give them. */
export function mapCardAccount(account: ScrapedAccount): MappedAccount<ParsedCCTransaction> {
  let pending = 0
  let invalid = 0
  const card = lastFour(account.accountNumber)
  const rows: ParsedCCTransaction[] = []
  for (const tx of account.txns) {
    if (tx.status === 'pending') {
      pending++
      continue
    }
    const transactionDate = israelDay(tx.date)
    const billingDate = israelDay(tx.processedDate || tx.date)
    if (!transactionDate || !billingDate) {
      invalid++
      continue
    }
    const installment = installmentNote(tx.installments)
    const memo = (tx.memo ?? '').trim()
    rows.push({
      transactionDate,
      billingDate,
      originalMerchantName: tx.description.trim(),
      merchantName: tx.description.trim(),
      category: (tx.category ?? '').trim(),
      chargedAmount: round2(-tx.chargedAmount),
      originalAmount: round2(-tx.originalAmount),
      originalCurrency: currencySymbol(tx.originalCurrency),
      chargedCurrency: currencySymbol(tx.chargedCurrency ?? 'ILS'),
      reference: tx.identifier === undefined || tx.identifier === null ? '' : String(tx.identifier),
      cardLastFour: card,
      transactionType: installment ? 'תשלומים' : 'רגילה',
      notes: [installment, memo].filter(Boolean).join(' · '),
      cardProvider: 'SYNC',
    })
  }
  return { externalAccount: account.accountNumber, rows, pending, invalid }
}
