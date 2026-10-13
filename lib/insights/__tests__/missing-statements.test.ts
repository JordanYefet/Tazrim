import { describe, expect, it } from 'vitest'
import {
  detectMissingStatements,
  formatMonthRanges,
  groupByProvider,
  missingStatementMessage,
  type DayCount,
  type MissingStatementsInput,
  type MonthCount,
  type PaymentRow,
  type StatementAccount,
} from '@/lib/insights/missing-statements'

// Made-up accounts, descriptions and dates only.
const BANK: StatementAccount = { id: 'bank1', kind: 'BANK', provider: 'fakebank', displayName: 'Fake Bank', archived: false }
const MAX: StatementAccount = { id: 'card_max', kind: 'CREDIT_CARD', provider: 'max', displayName: 'Fake Max', archived: false }
const CAL: StatementAccount = { id: 'card_cal', kind: 'CREDIT_CARD', provider: 'cal', displayName: 'Fake Cal', archived: false }

const months = (from: string, to: string): string[] => {
  const out: string[] = []
  let [y, m] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

/** A few bank rows on the 1st, 15th and 28th of each month */
const bankDays = (list: string[], accountId = BANK.id): DayCount[] =>
  list.flatMap(m => ['01', '15', '28'].map(d => ({ accountId, date: `${m}-${d}`, count: 2 })))

/** One card-company debit per month on `day` */
const payments = (list: string[], description = 'מקס איט פיננסים', day = '02'): PaymentRow[] =>
  list.map(m => ({ accountId: BANK.id, date: `${m}-${day}`, description }))

const cardMonths = (list: string[], accountId = MAX.id): MonthCount[] =>
  list.map(month => ({ accountId, month, count: 20 }))

function run(over: Partial<MissingStatementsInput>) {
  const input: MissingStatementsInput = {
    accounts: [BANK, MAX],
    bankDays: [],
    cardMonths: [],
    payments: [],
    today: '2030-10-13',
    ...over,
  }
  return Object.fromEntries(detectMissingStatements(input).map(r => [r.accountId, r.months]))
}

describe('detectMissingStatements: cards', () => {
  it('flags a missing month in the middle of the card data', () => {
    const all = months('2030-01', '2030-06')
    const res = run({
      bankDays: bankDays(all),
      payments: payments(all),
      cardMonths: cardMonths(all.filter(m => m !== '2030-03')),
    })
    expect(res[MAX.id]).toEqual(['2030-03'])
    expect(res[BANK.id]).toEqual([])
  })

  it('flags trailing months the card statement has not been uploaded for', () => {
    const all = months('2030-04', '2030-09')
    const res = run({ bankDays: bankDays(all), payments: payments(all), cardMonths: cardMonths(months('2030-04', '2030-06')) })
    expect(res[MAX.id]).toEqual(['2030-07', '2030-08', '2030-09'])
  })

  it('stops flagging a month once its statement is uploaded', () => {
    const all = months('2030-04', '2030-09')
    const base = { bankDays: bankDays(all), payments: payments(all) }
    expect(run({ ...base, cardMonths: cardMonths(months('2030-04', '2030-08')) })[MAX.id]).toEqual(['2030-09'])
    expect(run({ ...base, cardMonths: cardMonths(all) })[MAX.id]).toEqual([])
  })

  it('never flags the current month, even when its payment already went out', () => {
    const all = months('2030-07', '2030-10')
    const res = run({ bankDays: bankDays(all), payments: payments(all), cardMonths: cardMonths(months('2030-07', '2030-09')) })
    expect(res[MAX.id]).toEqual([])
  })

  it('does not flag a month whose usual payment day the bank data has not reached', () => {
    // Usual payment on the 10th; the bank data ends on the 5th of September,
    // after an extra small debit on the 3rd. Today is already in October.
    const all = months('2030-04', '2030-08')
    const res = run({
      bankDays: [...bankDays(all), { accountId: BANK.id, date: '2030-09-05', count: 1 }],
      payments: [...payments(all, 'מקס איט', '10'), { accountId: BANK.id, date: '2030-09-03', description: 'מקס איט' }],
      cardMonths: cardMonths(all),
    })
    expect(res[MAX.id]).toEqual([])
  })

  it('does flag that month once the bank data passes the usual payment day', () => {
    const all = months('2030-04', '2030-08')
    const res = run({
      bankDays: [...bankDays(all), { accountId: BANK.id, date: '2030-09-12', count: 1 }],
      payments: [...payments(all, 'מקס איט', '10'), { accountId: BANK.id, date: '2030-09-10', description: 'מקס איט' }],
      cardMonths: cardMonths(all),
    })
    expect(res[MAX.id]).toEqual(['2030-09'])
  })

  it('does not flag months without a payment to that card company', () => {
    const all = months('2030-01', '2030-06')
    const res = run({
      bankDays: bankDays(all),
      payments: [...payments(['2030-01', '2030-02']), ...payments(all, 'משכורת Fake Ltd')],
      cardMonths: cardMonths(['2030-01', '2030-02']),
    })
    expect(res[MAX.id]).toEqual([])
  })

  it('keeps two cards of different providers apart', () => {
    const all = months('2030-01', '2030-04')
    const res = run({
      accounts: [BANK, MAX, CAL],
      bankDays: bankDays(all),
      payments: [...payments(all, 'מקס איט'), ...payments(['2030-02', '2030-03', '2030-04'], 'ויזה כאל', '10')],
      cardMonths: [...cardMonths(['2030-01', '2030-02', '2030-04']), ...cardMonths(['2030-02'], CAL.id)],
    })
    expect(res[MAX.id]).toEqual(['2030-03'])
    expect(res[CAL.id]).toEqual(['2030-03', '2030-04'])
  })

  it('ignores archived cards', () => {
    const all = months('2030-01', '2030-04')
    const res = run({
      accounts: [BANK, MAX, { ...CAL, archived: true }],
      bankDays: bankDays(all),
      payments: [...payments(all), ...payments(all, 'ויזה כאל')],
      cardMonths: cardMonths(all),
    })
    expect(res[CAL.id]).toBeUndefined()
    expect(res[MAX.id]).toEqual([])
  })

  it('attributes a payment to the provider when several cards share it', () => {
    const second: StatementAccount = { ...MAX, id: 'card_max2', displayName: 'Fake Max 2' }
    const all = months('2030-01', '2030-04')
    const res = run({
      accounts: [BANK, MAX, second],
      bankDays: bankDays(all),
      payments: payments(all),
      // January on the first card, February on the second, nothing for March and April
      cardMonths: [...cardMonths(['2030-01']), ...cardMonths(['2030-02'], second.id)],
    })
    expect(res[MAX.id]).toEqual(['2030-03', '2030-04'])
    expect(res[second.id]).toEqual(['2030-03', '2030-04'])
  })

  it('counts an archived card of the provider as having the data', () => {
    const old: StatementAccount = { ...MAX, id: 'card_max_old', archived: true }
    const all = months('2030-01', '2030-03')
    const res = run({
      accounts: [BANK, MAX, old],
      bankDays: bankDays(all),
      payments: payments(all),
      cardMonths: [...cardMonths(['2030-01'], old.id), ...cardMonths(['2030-02', '2030-03'])],
    })
    expect(res[MAX.id]).toEqual([])
  })

  it('handles a year boundary', () => {
    const all = months('2030-10', '2031-03')
    const res = run({
      today: '2031-04-20',
      bankDays: bankDays(all),
      payments: payments(all),
      cardMonths: cardMonths(['2030-10', '2030-11', '2031-02', '2031-03']),
    })
    expect(res[MAX.id]).toEqual(['2030-12', '2031-01'])
  })
})

describe('detectMissingStatements: bank accounts', () => {
  it('flags months with no rows inside the covered range, not the edges', () => {
    const res = run({
      today: '2031-06-01',
      bankDays: bankDays(['2030-10', '2030-11', '2031-02', '2031-03']),
    })
    expect(res[BANK.id]).toEqual(['2030-12', '2031-01'])
  })

  it('flags nothing before the first or after the last bank month', () => {
    const res = run({ bankDays: bankDays(months('2030-03', '2030-05')) })
    expect(res[BANK.id]).toEqual([])
  })

  it('ignores archived bank accounts but still uses their rows as payment evidence', () => {
    const oldBank: StatementAccount = { ...BANK, id: 'bank_old', archived: true }
    const res = run({
      accounts: [oldBank, MAX],
      bankDays: bankDays(['2030-01', '2030-03'], oldBank.id),
      payments: payments(['2030-01', '2030-03']).map(p => ({ ...p, accountId: oldBank.id })),
      cardMonths: cardMonths(['2030-01']),
    })
    expect(res[oldBank.id]).toBeUndefined()
    expect(res[MAX.id]).toEqual(['2030-03'])
  })
})

describe('groupByProvider / missingStatementMessage', () => {
  const item = (accountId: string, provider: string, kind: 'BANK' | 'CREDIT_CARD', months: string[]) => ({
    accountId,
    provider,
    kind,
    displayName: accountId,
    months,
  })

  it('merges cards of one provider and drops accounts with nothing missing', () => {
    const groups = groupByProvider([
      item('a', 'max', 'CREDIT_CARD', ['2030-07']),
      item('b', 'max', 'CREDIT_CARD', ['2030-07', '2030-08']),
      item('c', 'cal', 'CREDIT_CARD', []),
      item('d', 'fakebank', 'BANK', ['2030-03']),
    ])
    expect(groups.map(g => [g.provider, g.months])).toEqual([
      ['max', ['2030-07', '2030-08']],
      ['fakebank', ['2030-03']],
    ])
  })

  it('words card and bank notices', () => {
    expect(missingStatementMessage('CREDIT_CARD', 'מקס', ['2026-07', '2026-08', '2026-09'])).toBe(
      'אין פירוט מקס עבור יולי–ספטמבר 2026'
    )
    expect(missingStatementMessage('BANK', 'לאומי', ['2026-03'])).toBe('חסרות תנועות לאומי עבור מרץ 2026')
  })
})

describe('formatMonthRanges', () => {
  it('formats a single month', () => {
    expect(formatMonthRanges(['2026-07'])).toBe('יולי 2026')
  })

  it('collapses consecutive months in one year', () => {
    expect(formatMonthRanges(['2026-09', '2026-07', '2026-08'])).toBe('יולי–ספטמבר 2026')
  })

  it('handles a range over a year boundary', () => {
    expect(formatMonthRanges(['2025-11', '2025-12', '2026-01'])).toBe('נובמבר 2025–ינואר 2026')
  })

  it('lists separate ranges', () => {
    expect(formatMonthRanges(['2026-03', '2026-07', '2026-08', '2026-08'])).toBe('מרץ 2026, יולי–אוגוסט 2026')
  })

  it('is empty for no months', () => {
    expect(formatMonthRanges([])).toBe('')
  })
})
