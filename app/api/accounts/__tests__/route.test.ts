import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

// All values are made up.

let db: TestDb
let list: typeof import('../route')
let item: typeof import('../[id]/route')

beforeAll(async () => {
  db = createTestDb()
  db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
    ('acct_test_card', 'CREDIT_CARD', 'max', 'Test card', 1900000000000);
  INSERT INTO "CreditCardTransaction" ("id","accountId","transactionDate","billingDate","originalMerchantName","merchantName","category","chargedAmount","originalAmount","originalCurrency","cardLastFour","transactionType") VALUES
    ('t1','acct_test_card',1893456000000,1893456000000,'Fake Shop','Fake Shop','cat',7,7,'ILS','','regular');`)
  usePrismaOn(db)
  list = await import('../route')
  item = await import('../[id]/route')
})

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

const json = (method: string, body?: unknown) =>
  new Request('http://localhost/api/accounts', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

describe('GET /api/accounts', () => {
  it('lists every account with counts', async () => {
    const rows = await (await list.GET()).json()
    expect(rows.map((r: { id: string }) => r.id)).toEqual(['acct_leumi', 'acct_max', 'acct_test_card'])
    expect(rows[2]).toMatchObject({ transactionCount: 1, counts: { creditCardTransactions: 1, uploads: 0 } })
  })
})

describe('POST /api/accounts', () => {
  it('201 with the created account', async () => {
    const res = await list.POST(json('POST', { kind: 'CREDIT_CARD', provider: 'max', displayName: 'Fake card 2', cardLastFour: '0000' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ kind: 'CREDIT_CARD', provider: 'max', displayName: 'Fake card 2', cardLastFour: '0000' })
  })

  it('accepts and returns a card network', async () => {
    const res = await list.POST(json('POST', { kind: 'CREDIT_CARD', provider: 'cal', displayName: 'Fake card 3', cardNetwork: 'amex' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ provider: 'cal', cardNetwork: 'amex' })
    const bad = await list.POST(json('POST', { kind: 'CREDIT_CARD', provider: 'cal', displayName: 'x', cardNetwork: 'nope' }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).field).toBe('cardNetwork')
  })

  it('400 for bad JSON and invalid fields', async () => {
    expect((await list.POST(json('POST', 'not json'))).status).toBe(400)
    const res = await list.POST(json('POST', { kind: 'PENSION', provider: 'x', displayName: 'x' }))
    expect(res.status).toBe(400)
    expect((await res.json()).field).toBe('kind')
    const last4 = await list.POST(json('POST', { kind: 'CREDIT_CARD', provider: 'max', displayName: 'x', cardLastFour: '12' }))
    expect((await last4.json()).field).toBe('cardLastFour')
  })
})

describe('PATCH /api/accounts/[id]', () => {
  it('renames, archives and restores', async () => {
    const renamed = await item.PATCH(json('PATCH', { displayName: 'Renamed card' }), ctx('acct_test_card'))
    expect(await renamed.json()).toMatchObject({ displayName: 'Renamed card' })
    const archived = await item.PATCH(json('PATCH', { archived: true }), ctx('acct_test_card'))
    expect(await archived.json()).toMatchObject({ archived: true })
    const restored = await item.PATCH(json('PATCH', { archived: false }), ctx('acct_test_card'))
    expect(await restored.json()).toMatchObject({ archived: false })
  })

  it('sets and clears the card network', async () => {
    const set = await item.PATCH(json('PATCH', { cardNetwork: 'Mastercard' }), ctx('acct_test_card'))
    expect(await set.json()).toMatchObject({ cardNetwork: 'mastercard' })
    const cleared = await item.PATCH(json('PATCH', { cardNetwork: null }), ctx('acct_test_card'))
    expect(await cleared.json()).toMatchObject({ cardNetwork: null })
  })

  it('400 for a bad network or a network on a bank, and nothing is written', async () => {
    const bad = await item.PATCH(json('PATCH', { displayName: 'Not saved', cardNetwork: 'nope' }), ctx('acct_test_card'))
    expect(bad.status).toBe(400)
    expect((await bad.json()).field).toBe('cardNetwork')
    expect(db.query(`SELECT displayName FROM "Account" WHERE id = 'acct_test_card'`)).toEqual([{ displayName: 'Renamed card' }])
    expect((await item.PATCH(json('PATCH', { cardNetwork: 'visa' }), ctx('acct_leumi'))).status).toBe(400)
  })

  it('400 for nothing to update, a bad name or a non-boolean archived', async () => {
    expect((await item.PATCH(json('PATCH', {}), ctx('acct_test_card'))).status).toBe(400)
    expect((await item.PATCH(json('PATCH', { displayName: ' ' }), ctx('acct_test_card'))).status).toBe(400)
    expect((await item.PATCH(json('PATCH', { archived: 'yes' }), ctx('acct_test_card'))).status).toBe(400)
  })

  it('404 for an unknown account', async () => {
    expect((await item.PATCH(json('PATCH', { displayName: 'x' }), ctx('acct_nope'))).status).toBe(404)
  })

  it('edits every field at once: digits, colour (ENG-65/66)', async () => {
    const res = await item.PATCH(json('PATCH', { cardLastFour: '0000', color: 'Violet', cardNetwork: 'amex' }), ctx('acct_test_card'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ cardLastFour: '0000', color: 'violet', cardNetwork: 'amex' })
    const bad = await item.PATCH(json('PATCH', { color: 'not a colour' }), ctx('acct_test_card'))
    expect(bad.status).toBe(400)
    expect((await bad.json()).field).toBe('color')
  })

  it('409 PROVIDER_CHANGE_UNCONFIRMED for a card with rows, then changes with confirmation', async () => {
    const res = await item.PATCH(json('PATCH', { provider: 'cal' }), ctx('acct_test_card'))
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ code: 'PROVIDER_CHANGE_UNCONFIRMED', transactionCount: 1 })
    const ok = await item.PATCH(json('PATCH', { provider: 'cal', confirmProviderChange: true }), ctx('acct_test_card'))
    expect(await ok.json()).toMatchObject({ provider: 'cal' })
  })

  it('bank accounts are edited the same way', async () => {
    const res = await item.PATCH(json('PATCH', { displayName: 'Fake bank renamed', color: 'glass' }), ctx('acct_leumi'))
    expect(await res.json()).toMatchObject({ displayName: 'Fake bank renamed', color: 'glass' })
    expect((await item.PATCH(json('PATCH', { cardLastFour: '1234' }), ctx('acct_leumi'))).status).toBe(400)
  })
})

describe('DELETE /api/accounts/[id]', () => {
  it('404 for an unknown account', async () => {
    expect((await item.DELETE(json('DELETE'), ctx('acct_nope'))).status).toBe(404)
  })

  it('409 CONFIRMATION_REQUIRED without the typed name, then deletes with it', async () => {
    const res = await item.DELETE(json('DELETE', { confirm: 'wrong' }), ctx('acct_test_card'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('CONFIRMATION_REQUIRED')

    const ok = await item.DELETE(json('DELETE', { confirm: 'Renamed card' }), ctx('acct_test_card'))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ ok: true, deleted: { creditCardTransactions: 1 } })
    expect(db.query(`SELECT COUNT(*) AS n FROM "CreditCardTransaction"`)).toEqual([{ n: 0 }])
  })

  it('409 LAST_OF_KIND for the only bank account', async () => {
    const res = await item.DELETE(json('DELETE'), ctx('acct_leumi'))
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('LAST_OF_KIND')
  })
})

describe('card payer (payerAccountId)', () => {
  const payerOf = (id: string) => db.query<{ payerAccountId: string | null }>(`SELECT payerAccountId FROM "Account" WHERE id = '${id}'`)[0]?.payerAccountId

  it('links a new card to a bank account, and refuses one on a bank or to a non-bank', async () => {
    const res = await list.POST(json('POST', { kind: 'CREDIT_CARD', provider: 'max', displayName: 'Payer card', payerAccountId: 'acct_leumi' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ payerAccountId: 'acct_leumi' })
    const onBank = await list.POST(json('POST', { kind: 'BANK', provider: 'leumi', displayName: 'x', payerAccountId: 'acct_leumi' }))
    expect(onBank.status).toBe(400)
    expect((await onBank.json()).field).toBe('payerAccountId')
    const toCard = await list.POST(json('POST', { kind: 'CREDIT_CARD', provider: 'max', displayName: 'x', payerAccountId: 'acct_max' }))
    expect((await toCard.json()).field).toBe('payerAccountId')
  })

  it('sets, refuses an archived payer, and clears on PATCH', async () => {
    db.exec(`INSERT INTO "Account" ("id","kind","provider","displayName","archived","createdAt") VALUES
      ('acct_old_bank', 'BANK', 'discount', 'Old fake bank', true, 1900000000000);`)
    const set = await item.PATCH(json('PATCH', { payerAccountId: 'acct_leumi' }), ctx('acct_max'))
    expect(await set.json()).toMatchObject({ payerAccountId: 'acct_leumi' })
    const archived = await item.PATCH(json('PATCH', { payerAccountId: 'acct_old_bank' }), ctx('acct_max'))
    expect(archived.status).toBe(400)
    expect(payerOf('acct_max')).toBe('acct_leumi')
    expect((await item.PATCH(json('PATCH', { payerAccountId: 'acct_leumi' }), ctx('acct_leumi'))).status).toBe(400)
    const cleared = await item.PATCH(json('PATCH', { payerAccountId: null }), ctx('acct_max'))
    expect(await cleared.json()).toMatchObject({ payerAccountId: null })
  })

  it('a new bank account takes the cards it pays (paidCardIds)', async () => {
    const res = await list.POST(json('POST', { kind: 'BANK', provider: 'hapoalim', displayName: 'Fake bank 2', paidCardIds: ['acct_max'] }))
    expect(res.status).toBe(201)
    const bank = await res.json()
    expect(payerOf('acct_max')).toBe(bank.id)
    const bad = await list.POST(json('POST', { kind: 'BANK', provider: 'hapoalim', displayName: 'x', paidCardIds: ['acct_leumi'] }))
    expect((await bad.json()).field).toBe('paidCardIds')
    // Deleting the payer unlinks its cards (onDelete SetNull)
    expect((await item.DELETE(json('DELETE'), ctx(bank.id))).status).toBe(200)
    expect(payerOf('acct_max')).toBeNull()
  })
})

describe('bank account number (bankAccountNumber)', () => {
  it('saves a new bank account\'s number as typed, and refuses one on a card or a malformed one', async () => {
    const res = await list.POST(json('POST', { kind: 'BANK', provider: 'leumi', displayName: 'Numbered bank', bankAccountNumber: '  12-345-678901 ' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ bankAccountNumber: '12-345-678901' })
    const blank = await list.POST(json('POST', { kind: 'BANK', provider: 'leumi', displayName: 'Unnumbered bank', bankAccountNumber: '  ' }))
    expect(await blank.json()).toMatchObject({ bankAccountNumber: null })
    const onCard = await list.POST(json('POST', { kind: 'CREDIT_CARD', provider: 'max', displayName: 'x', bankAccountNumber: '12-345-678901' }))
    expect(onCard.status).toBe(400)
    expect((await onCard.json()).field).toBe('bankAccountNumber')
    for (const bad of ['123', 'abc-1234', '12--345', '-12345', '1'.repeat(21), 12345]) {
      const r = await list.POST(json('POST', { kind: 'BANK', provider: 'leumi', displayName: 'x', bankAccountNumber: bad }))
      expect((await r.json()).field).toBe('bankAccountNumber')
    }
  })

  it('sets, keeps the "/" and space forms, and clears on PATCH; refuses on a card', async () => {
    const slash = await item.PATCH(json('PATCH', { bankAccountNumber: '345/678901' }), ctx('acct_leumi'))
    expect(await slash.json()).toMatchObject({ bankAccountNumber: '345/678901' })
    const spaced = await item.PATCH(json('PATCH', { bankAccountNumber: '12  345   678901' }), ctx('acct_leumi'))
    expect(await spaced.json()).toMatchObject({ bankAccountNumber: '12 345 678901' })
    expect((await item.PATCH(json('PATCH', { bankAccountNumber: '1234' }), ctx('acct_max'))).status).toBe(400)
    const cleared = await item.PATCH(json('PATCH', { bankAccountNumber: '' }), ctx('acct_leumi'))
    expect(await cleared.json()).toMatchObject({ bankAccountNumber: null })
  })
})
