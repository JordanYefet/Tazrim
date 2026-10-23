#!/usr/bin/env node
/**
 * Builds a demo database full of made-up transactions, for trying the app and
 * for the README screenshots. Every merchant, amount and card number here is
 * invented.
 *
 *   npm run db:demo            -> prisma/demo.db
 *   npm run dev:demo           -> the app on that database
 *
 * Runs the real migrations with the sqlite3 CLI (like lib/db/__tests__/test-db.ts),
 * then inserts a year of activity up to today: three bank accounts and three
 * cards, each card's bill paid from one of the banks.
 */
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// --data-only (used by the Docker image with TAZRIM_DEMO=1): the database is
// already migrated by `prisma migrate deploy`; only add the demo rows, and only
// when it has no transactions yet, so real data is never mixed with demo data.
const dataOnly = process.argv.includes('--data-only')
const file = path.resolve(root, process.argv.slice(2).find(a => !a.startsWith('--')) ?? 'prisma/demo.db')
const migrationsDir = path.join(root, 'prisma/migrations')

if (!dataOnly) {
  fs.rmSync(file, { force: true })
  const exec = sql => execFileSync('sqlite3', ['-bail', file], { input: sql })
  exec(`CREATE TABLE "_prisma_migrations" (
    "id" TEXT PRIMARY KEY NOT NULL, "checksum" TEXT NOT NULL, "finished_at" DATETIME,
    "migration_name" TEXT NOT NULL, "logs" TEXT, "rolled_back_at" DATETIME,
    "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0);`)
  for (const name of fs.readdirSync(migrationsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) {
    exec(fs.readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8'))
    exec(`INSERT INTO "_prisma_migrations" ("id","checksum","migration_name","finished_at","applied_steps_count")
          VALUES ('demo-${name}','demo','${name}',CURRENT_TIMESTAMP,1);`)
  }
}

// Deterministic, so the demo looks the same on every run
let seed = 20260101
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const between = (lo, hi) => Math.round((lo + rand() * (hi - lo)) * 100) / 100
const pick = list => list[Math.floor(rand() * list.length)]

// Leumi and Max are created by the add_account migration; the others here
const BANKS = [
  { id: 'acct_leumi', provider: 'leumi', displayName: 'בנק לאומי', opening: 12500 },
  { id: 'acct_hapoalim', provider: 'hapoalim', displayName: 'חשבון אישי', opening: 6800 },
  { id: 'acct_discount', provider: 'discount', displayName: 'חיסכון', opening: 24000 },
]
// Each card's bill is paid from one bank, on its billing day, under a name the
// app recognises as that company's payment (lib/insights/card-payment.ts)
const CARDS = [
  { id: 'acct_max', provider: 'max', displayName: 'מקס', lastFour: '1234', network: 'mastercard', bank: 'acct_leumi', billingDay: 10, payment: 'מקס איט פיננסים' },
  { id: 'acct_cal', provider: 'cal', displayName: 'כאל', lastFour: '5678', network: 'visa', bank: 'acct_leumi', billingDay: 2, payment: 'כרטיסי אשראי לישראל' },
  { id: 'acct_isracard', provider: 'isracard', displayName: 'ישראכרט', lastFour: '9012', network: 'isracard', bank: 'acct_hapoalim', billingDay: 15, payment: 'ישראכרט' },
]

// Per card: [merchant, category, min, max, times per month]
const CARD_MERCHANTS = {
  acct_max: [
    ['סופר השכונה', 'מזון וצריכה', 90, 520, 6],
    ['מכולת הפינה', 'מזון וצריכה', 25, 140, 4],
    ['קפה בוקר טוב', 'מסעדות, קפה וברים', 18, 65, 5],
  ],
  acct_cal: [
    ['דלק בדרך', 'תחבורה ורכבים', 180, 360, 2],
    ['חניון העיר', 'תחבורה ורכבים', 12, 40, 3],
    ['בית מרקחת השכונתי', 'רפואה ובתי מרקחת', 30, 160, 1],
  ],
  acct_isracard: [
    ['פיצה על האש', 'מסעדות, קפה וברים', 60, 180, 2],
    ['חנות בגדים לדוגמה', 'אופנה', 120, 450, 1],
    ['ספרים ועוד', 'פנאי, בידור וספורט', 45, 140, 1],
  ],
}
// Per card: [merchant, category, amount, day of month]
const CARD_FIXED = {
  acct_max: [['חברת סלולר', 'שירותי תקשורת', 59, 12]],
  acct_cal: [
    ['שירות סטרימינג', 'פנאי, בידור וספורט', 49.9, 3],
    ['אפליקציית מוזיקה', 'פנאי, בידור וספורט', 21.9, 7],
  ],
  acct_isracard: [['חדר כושר שכונתי', 'פנאי, בידור וספורט', 229, 1]],
}

// Bank rows: description -> category, by direction (card payments get none:
// their charges are already categorised on the card). Category names are unique
// across kinds, hence the two transfer names.
const BANK_CATEGORIES = {
  OUT: {
    'שכר דירה': 'דיור',
    'חברת החשמל': 'חשבונות הבית',
    'ארנונה': 'חשבונות הבית',
    'ועד בית': 'חשבונות הבית',
    'תאגיד המים': 'חשבונות הבית',
    'גן ילדים לדוגמה': 'חינוך וילדים',
    'ביטוח רכב': 'ביטוח',
    'העברה לחיסכון': 'חיסכון',
    'העברה לחשבון לאומי': 'העברה לחשבון אחר',
  },
  IN: {
    'משכורת - חברה לדוגמה בע"מ': 'משכורת',
    'משכורת - חברה נוספת בע"מ': 'משכורת',
    'החזר מס': 'החזרים',
    'ריבית זכות': 'ריבית',
    'העברה מחשבון הפועלים': 'העברה מחשבון אחר',
    'העברה מחשבון לאומי': 'העברה מחשבון אחר',
  },
}

const today = new Date()
const year = today.getFullYear()
const lastMonth = today.getMonth() + 1
// Month m of `year` (0 is last December, 13 next January)
const day = (m, d) => new Date(year, m - 1, d)
const hash = s => crypto.createHash('sha1').update(s).digest('hex')

// Card purchases from last December through last month, so every bill up to
// this month's is complete and nothing is billed in the future
const cardRows = []
for (let m = 0; m < lastMonth; m++) {
  const daysInMonth = new Date(year, m, 0).getDate()
  for (const card of CARDS) {
    const add = (merchant, category, amount, d) => {
      const date = day(m, d)
      cardRows.push({
        accountId: card.id,
        transactionDate: date,
        billingDate: day(m + 1, card.billingDay), // billed the next month
        originalMerchantName: merchant,
        merchantName: merchant,
        category,
        chargedAmount: amount,
        originalAmount: amount,
        originalCurrency: '₪',
        cardLastFour: card.lastFour,
        transactionType: 'רגילה',
        contentHash: hash(`${card.id}|${merchant}|${date.toISOString()}|${amount}|${cardRows.length}`),
        sourceFile: `demo-${card.provider}.xlsx`,
      })
    }
    for (const [merchant, category, lo, hi, times] of CARD_MERCHANTS[card.id])
      for (let i = 0; i < times; i++) add(merchant, category, between(lo, hi), 1 + Math.floor(rand() * daysInMonth))
    for (const [merchant, category, amount, d] of CARD_FIXED[card.id]) add(merchant, category, amount, d)
    // One unusually large purchase, so the "unusual" card has something to show
    if (m === lastMonth - 1 && card.id === 'acct_isracard') add('חנות אלקטרוניקה', 'מוצרי חשמל', 3890, 18)
  }
}

const bankEvents = Object.fromEntries(BANKS.map(b => [b.id, []]))
for (let m = 1; m <= lastMonth; m++) {
  const ev = (bank, d, description, debit, credit) => {
    const date = day(m, d)
    if (date <= today) bankEvents[bank].push({ date, description, debit, credit })
  }
  // Leumi: the main account
  ev('acct_leumi', 1, 'שכר דירה', 5200, 0)
  ev('acct_leumi', 5, 'חברת החשמל', between(240, 520), 0)
  ev('acct_leumi', 8, 'ארנונה', 690, 0)
  ev('acct_leumi', 9, 'משכורת - חברה לדוגמה בע"מ', 0, between(17800, 18600))
  ev('acct_leumi', 15, 'העברה לחיסכון', 1500, 0)
  if (m % 3 === 0) ev('acct_leumi', 20, 'ביטוח רכב', 410, 0)
  if (m === 4) ev('acct_leumi', 22, 'החזר מס', 0, 2350)
  // Hapoalim: a second, smaller salary and its own bills
  ev('acct_hapoalim', 10, 'משכורת - חברה נוספת בע"מ', 0, between(11200, 11800))
  ev('acct_hapoalim', 4, 'ועד בית', 180, 0)
  ev('acct_hapoalim', 6, 'תאגיד המים', between(90, 210), 0)
  ev('acct_hapoalim', 12, 'גן ילדים לדוגמה', 3400, 0)
  ev('acct_hapoalim', 18, 'העברה לחשבון לאומי', 4000, 0)
  ev('acct_leumi', 18, 'העברה מחשבון הפועלים', 0, 4000)
  // Discount: savings, fed by the monthly transfer
  ev('acct_discount', 15, 'העברה מחשבון לאומי', 0, 1500)
  if (m % 3 === 0) ev('acct_discount', 28, 'ריבית זכות', 0, between(60, 90))
  // Each card's bill, from its bank
  for (const card of CARDS) {
    const billed = cardRows
      .filter(r => r.accountId === card.id && r.billingDate.getMonth() + 1 === m && r.billingDate.getFullYear() === year)
      .reduce((s, r) => s + r.chargedAmount, 0)
    if (billed) ev(card.bank, card.billingDay, card.payment, Math.round(billed * 100) / 100, 0)
  }
}
const bankRows = BANKS.flatMap(b => {
  let balance = b.opening
  return bankEvents[b.id]
    .sort((x, y) => x.date - y.date)
    .map(e => {
      balance = Math.round((balance + e.credit - e.debit) * 100) / 100
      return {
        accountId: b.id,
        date: e.date,
        originalDescription: e.description,
        description: e.description,
        debit: e.debit,
        credit: e.credit,
        balance,
        category: BANK_CATEGORIES[e.debit > 0 ? 'OUT' : 'IN'][e.description] ?? null,
        sourceFile: `demo-${b.provider}.xlsx`,
      }
    })
})

const prisma = new PrismaClient({ datasourceUrl: `file:${file}` })
if (dataOnly && (await prisma.bankTransaction.count()) + (await prisma.creditCardTransaction.count()) > 0) {
  console.log('Demo data skipped: the database already has transactions')
  await prisma.$disconnect()
  process.exit(0)
}
for (const b of BANKS) {
  const { opening, ...data } = b
  await prisma.account.upsert({ where: { id: b.id }, update: {}, create: { ...data, kind: 'BANK' } })
}
for (const c of CARDS) {
  const fields = { cardLastFour: c.lastFour, cardNetwork: c.network }
  await prisma.account.upsert({
    where: { id: c.id },
    update: fields,
    create: { id: c.id, kind: 'CREDIT_CARD', provider: c.provider, displayName: c.displayName, ...fields },
  })
}
// The categories in use, and a rule per bank description (as categorising a row "for every row like it" makes)
const expense = new Set([...cardRows.map(r => r.category), ...Object.values(BANK_CATEGORIES.OUT)])
const income = new Set(Object.values(BANK_CATEGORIES.IN))
for (const [names, kind] of [[expense, 'EXPENSE'], [income, 'INCOME']])
  for (const name of names) await prisma.category.upsert({ where: { name }, update: {}, create: { name, kind } })
const providerOf = Object.fromEntries(BANKS.map(b => [b.id, b.provider]))
const rules = new Map()
for (const r of bankRows) {
  if (!r.category) continue
  const direction = r.debit > 0 ? 'OUT' : 'IN'
  const provider = providerOf[r.accountId]
  rules.set(`${provider}|${r.originalDescription}|${direction}`, { provider, originalDescription: r.originalDescription, direction, category: r.category })
}
await prisma.bankCategoryRule.createMany({ data: [...rules.values()] })
await prisma.bankTransaction.createMany({ data: bankRows })
await prisma.creditCardTransaction.createMany({ data: cardRows })
await prisma.uploadHistory.createMany({
  data: [...BANKS, ...CARDS].map(a => ({
    accountId: a.id,
    fileName: `demo-${a.provider}.xlsx`,
    recordCount: [...bankRows, ...cardRows].filter(r => r.accountId === a.id).length,
  })),
})
await prisma.$disconnect()

console.log(`Demo database: ${dataOnly ? file : path.relative(root, file)} (${BANKS.length} banks, ${bankRows.length} bank rows; ${CARDS.length} cards, ${cardRows.length} card rows)`)
