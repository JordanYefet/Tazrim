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
 * then inserts a year of bank and card activity up to today.
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

const BANK = 'acct_leumi' // created by the add_account migration
const CARD = 'acct_max'
const CARD_LAST_FOUR = '1234'

// [merchant, category, min, max, times per month]
const CARD_MERCHANTS = [
  ['סופר השכונה', 'מזון וצריכה', 90, 520, 6],
  ['מכולת הפינה', 'מזון וצריכה', 25, 140, 4],
  ['קפה בוקר טוב', 'מסעדות, קפה וברים', 18, 65, 5],
  ['פיצה על האש', 'מסעדות, קפה וברים', 60, 180, 2],
  ['דלק בדרך', 'תחבורה ורכבים', 180, 360, 2],
  ['חניון העיר', 'תחבורה ורכבים', 12, 40, 3],
  ['בית מרקחת השכונתי', 'רפואה ובתי מרקחת', 30, 160, 1],
  ['חנות בגדים לדוגמה', 'אופנה', 120, 450, 1],
  ['ספרים ועוד', 'פנאי, בידור וספורט', 45, 140, 1],
]
// [merchant, category, amount, day of month]
const CARD_FIXED = [
  ['שירות סטרימינג', 'פנאי, בידור וספורט', 49.9, 3],
  ['אפליקציית מוזיקה', 'פנאי, בידור וספורט', 21.9, 7],
  ['חדר כושר שכונתי', 'פנאי, בידור וספורט', 229, 1],
  ['חברת סלולר', 'שירותי תקשורת', 59, 12],
]

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
  const add = (merchant, category, amount, d) => {
    const date = day(m, d)
    cardRows.push({
      accountId: CARD,
      transactionDate: date,
      billingDate: day(m + 1, 10), // billed on the 10th of the next month
      originalMerchantName: merchant,
      merchantName: merchant,
      category,
      chargedAmount: amount,
      originalAmount: amount,
      originalCurrency: '₪',
      cardLastFour: CARD_LAST_FOUR,
      transactionType: 'רגילה',
      contentHash: hash(`${merchant}|${date.toISOString()}|${amount}|${cardRows.length}`),
      sourceFile: 'demo-card.xlsx',
    })
  }
  for (const [merchant, category, lo, hi, times] of CARD_MERCHANTS)
    for (let i = 0; i < times; i++) add(merchant, category, between(lo, hi), 1 + Math.floor(rand() * daysInMonth))
  for (const [merchant, category, amount, d] of CARD_FIXED) add(merchant, category, amount, d)
  // One unusually large purchase, so the "unusual" card has something to show
  if (m === lastMonth - 1) add('חנות אלקטרוניקה', 'מוצרי חשמל', 3890, 18)
}

const bankEvents = []
for (let m = 1; m <= lastMonth; m++) {
  const ev = (d, description, debit, credit) => {
    const date = day(m, d)
    if (date <= today) bankEvents.push({ date, description, debit, credit })
  }
  ev(1, 'שכר דירה', 5200, 0)
  ev(5, 'חברת החשמל', between(240, 520), 0)
  ev(8, 'ארנונה', 690, 0)
  ev(9, 'משכורת - חברה לדוגמה בע"מ', 0, between(17800, 18600))
  const billed = cardRows
    .filter(r => r.billingDate.getMonth() + 1 === m && r.billingDate.getFullYear() === year)
    .reduce((s, r) => s + r.chargedAmount, 0)
  if (billed) ev(10, 'מקס איט פיננסים', Math.round(billed * 100) / 100, 0)
  ev(15, 'העברה לחיסכון', 1500, 0)
  if (m % 3 === 0) ev(20, 'ביטוח רכב', 410, 0)
  if (m === 4) ev(22, 'החזר מס', 0, 2350)
}
bankEvents.sort((a, b) => a.date - b.date)
let balance = 12500
const bankRows = bankEvents.map(e => {
  balance = Math.round((balance + e.credit - e.debit) * 100) / 100
  return {
    accountId: BANK,
    date: e.date,
    originalDescription: e.description,
    description: e.description,
    debit: e.debit,
    credit: e.credit,
    balance,
    sourceFile: 'demo-bank.xlsx',
  }
})

const prisma = new PrismaClient({ datasourceUrl: `file:${file}` })
if (dataOnly && (await prisma.bankTransaction.count()) + (await prisma.creditCardTransaction.count()) > 0) {
  console.log('Demo data skipped: the database already has transactions')
  await prisma.$disconnect()
  process.exit(0)
}
await prisma.account.update({ where: { id: CARD }, data: { cardLastFour: CARD_LAST_FOUR } })
await prisma.bankTransaction.createMany({ data: bankRows })
await prisma.creditCardTransaction.createMany({ data: cardRows })
await prisma.uploadHistory.createMany({
  data: [
    { accountId: BANK, fileName: 'demo-bank.xlsx', recordCount: bankRows.length },
    { accountId: CARD, fileName: 'demo-card.xlsx', recordCount: cardRows.length },
  ],
})
await prisma.$disconnect()

console.log(`Demo database: ${dataOnly ? file : path.relative(root, file)} (${bankRows.length} bank rows, ${cardRows.length} card rows)`)
