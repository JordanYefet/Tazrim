import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from './test-db'
import type { ParsedBankTransaction } from '../../parsers/types'
import { STARTING_GENERIC_DESCRIPTIONS } from '../starting-generic-descriptions'

let db: TestDb
let bank: typeof import('../bank')
let cats: typeof import('../bank-categories')
let generic: typeof import('../generic-descriptions')

// Made-up rows only. 'שיק' is on the starting list; 'FAKE CHEQUE' and 'FAKE UTILITY' are not.
const row = (over: Partial<ParsedBankTransaction> = {}): ParsedBankTransaction => ({
  date: new Date(2030, 1, 10),
  originalDescription: 'FAKE CHEQUE',
  description: 'FAKE CHEQUE',
  debit: 100,
  credit: 0,
  balance: 1000,
  note: '',
  sourceFile: 'fake.xlsx',
  ...over,
})

const categoryOf = (id: string) =>
  db.query<{ category: string | null; categoryManual: number }>(
    `SELECT category, categoryManual FROM "BankTransaction" WHERE id = '${id}'`
  )[0]

const idOf = (accountId: string, description: string, day: number) =>
  db.query<{ id: string }>(
    `SELECT id FROM "BankTransaction" WHERE accountId = '${accountId}' AND originalDescription = '${description}'
     AND date = ${new Date(2030, 1, day).getTime()}`
  )[0].id

const rules = () => db.query<{ originalDescription: string }>(`SELECT originalDescription FROM "BankCategoryRule" ORDER BY originalDescription`)

beforeAll(async () => {
  db = createTestDb()
  db.exec(`
INSERT INTO "Account" ("id","kind","provider","displayName","createdAt") VALUES
  ('acct_fake_other', 'BANK', 'otherbank', 'Other fake bank', 1900000000000);
INSERT INTO "Category" ("id","name","kind") VALUES
  ('k1','Fake Rent','EXPENSE'), ('k2','Fake Salary','INCOME'), ('k4','Fake Food','EXPENSE');
`)
  usePrismaOn(db)
  bank = await import('../bank')
  cats = await import('../bank-categories')
  generic = await import('../generic-descriptions')
})

beforeEach(() =>
  db.exec(`DELETE FROM "BankTransaction"; DELETE FROM "BankCategoryRule";
    DELETE FROM "GenericDescription" WHERE description NOT IN (${STARTING_GENERIC_DESCRIPTIONS.map(d => `'${d}'`).join(',')});`)
)

afterAll(async () => {
  await releasePrisma()
  db.cleanup()
})

/** FAKE CHEQUE out and in at one bank, out at another, one of them set by hand; FAKE UTILITY under a rule */
async function seed() {
  await bank.upsertBankTransactions(
    [
      row({ date: new Date(2030, 1, 1) }),
      row({ date: new Date(2030, 1, 2), debit: 0, credit: 200 }),
      row({ date: new Date(2030, 1, 3), debit: 300 }),
      row({ date: new Date(2030, 1, 4), originalDescription: 'FAKE UTILITY', description: 'FAKE UTILITY', debit: 50 }),
    ],
    'acct_leumi'
  )
  await bank.upsertBankTransactions([row({ date: new Date(2030, 1, 5) })], 'acct_fake_other')
  await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE CHEQUE', 1), category: 'Fake Rent', scope: 'rule' })
  await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE CHEQUE', 2), category: 'Fake Salary', scope: 'rule' })
  await cats.setBankCategory({ id: idOf('acct_fake_other', 'FAKE CHEQUE', 5), category: 'Fake Rent', scope: 'rule' })
  await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE CHEQUE', 3), category: 'Fake Food', scope: 'row' })
  await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE UTILITY', 4), category: 'Fake Food', scope: 'rule' })
}

describe('generic descriptions', () => {
  it('lists the starting list', async () => {
    expect((await generic.listGenericDescriptions()).sort()).toEqual([...STARTING_GENERIC_DESCRIPTIONS].sort())
  })

  it('marking one drops its rules at every bank and direction and clears what they set; manual rows keep theirs', async () => {
    await seed()
    const result = await generic.markGenericDescription('  FAKE CHEQUE ')
    expect(result.description).toBe('FAKE CHEQUE')
    expect(result.clearedIds.sort()).toEqual(
      [idOf('acct_leumi', 'FAKE CHEQUE', 1), idOf('acct_leumi', 'FAKE CHEQUE', 2), idOf('acct_fake_other', 'FAKE CHEQUE', 5)].sort()
    )
    expect(rules()).toEqual([{ originalDescription: 'FAKE UTILITY' }])
    expect(categoryOf(idOf('acct_leumi', 'FAKE CHEQUE', 1))).toEqual({ category: null, categoryManual: 0 })
    expect(categoryOf(idOf('acct_leumi', 'FAKE CHEQUE', 2))).toEqual({ category: null, categoryManual: 0 })
    expect(categoryOf(idOf('acct_fake_other', 'FAKE CHEQUE', 5))).toEqual({ category: null, categoryManual: 0 })
    expect(categoryOf(idOf('acct_leumi', 'FAKE CHEQUE', 3))).toEqual({ category: 'Fake Food', categoryManual: 1 })
    expect(categoryOf(idOf('acct_leumi', 'FAKE UTILITY', 4))).toEqual({ category: 'Fake Food', categoryManual: 0 })
    expect(await generic.listGenericDescriptions()).toContain('FAKE CHEQUE')
  })

  it('marking one twice is harmless, and an empty one is refused', async () => {
    await generic.markGenericDescription('FAKE CHEQUE')
    await generic.markGenericDescription('FAKE CHEQUE')
    expect((await generic.listGenericDescriptions()).filter(d => d === 'FAKE CHEQUE')).toHaveLength(1)
    await expect(generic.markGenericDescription('   ')).rejects.toMatchObject({ status: 400 })
  })

  it('unmarking only takes it off the list', async () => {
    await seed()
    await generic.markGenericDescription('FAKE CHEQUE')
    await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE CHEQUE', 1), category: 'Fake Rent', scope: 'row' })
    await generic.unmarkGenericDescription('FAKE CHEQUE')
    expect(await generic.listGenericDescriptions()).not.toContain('FAKE CHEQUE')
    expect(categoryOf(idOf('acct_leumi', 'FAKE CHEQUE', 1))).toEqual({ category: 'Fake Rent', categoryManual: 1 })
    expect(categoryOf(idOf('acct_leumi', 'FAKE CHEQUE', 2)).category).toBeNull()
    // and a rule can be saved for it again
    await cats.setBankCategory({ id: idOf('acct_leumi', 'FAKE CHEQUE', 2), category: 'Fake Salary', scope: 'rule' })
    expect(rules()).toEqual([{ originalDescription: 'FAKE CHEQUE' }, { originalDescription: 'FAKE UTILITY' }])
  })

  it("setBankCategory refuses a rule for a generic description, and still sets the row", async () => {
    await bank.upsertBankTransactions([row({ originalDescription: 'שיק', description: 'שיק' })], 'acct_leumi')
    const id = idOf('acct_leumi', 'שיק', 10)
    await expect(cats.setBankCategory({ id, category: 'Fake Rent', scope: 'rule' })).rejects.toMatchObject({ status: 400 })
    await expect(cats.setBankCategory({ id, category: null, scope: 'rule' })).rejects.toMatchObject({ status: 400 })
    expect(rules()).toEqual([])
    expect(await cats.setBankCategory({ id, category: 'Fake Rent', scope: 'row' })).toEqual({ updatedIds: [id] })
    expect(categoryOf(id)).toEqual({ category: 'Fake Rent', categoryManual: 1 })
  })

  it('an import never applies a rule to a generic description', async () => {
    // A rule left over (none should exist), for a description on the list
    db.exec(`INSERT INTO "BankCategoryRule" ("id","provider","originalDescription","direction","category") VALUES
      ('r_left','leumi','שיק','OUT','Fake Rent'), ('r_util','leumi','FAKE UTILITY','OUT','Fake Food')`)
    await bank.upsertBankTransactions(
      [
        row({ date: new Date(2030, 1, 11), originalDescription: 'שיק', description: 'שיק' }),
        row({ date: new Date(2030, 1, 12), originalDescription: 'FAKE UTILITY', description: 'FAKE UTILITY' }),
      ],
      'acct_leumi'
    )
    expect(categoryOf(idOf('acct_leumi', 'שיק', 11)).category).toBeNull()
    expect(categoryOf(idOf('acct_leumi', 'FAKE UTILITY', 12)).category).toBe('Fake Food')
  })
})
