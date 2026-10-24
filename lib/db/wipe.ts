import type { Prisma } from '@prisma/client'
import { prisma } from './client'
import { STARTING_CATEGORIES } from './starting-categories'

/**
 * Every data table, in the order its rows are deleted: rows that point at an
 * Account go before Account itself. Typed as a Record over Prisma.ModelName,
 * so adding a model to the schema fails type-checking until it is listed here.
 */
const WIPE_ORDER = {
  UnusualDismissal: 1,
  RecurringSeriesOverride: 2,
  // members before their series (FK)
  ManualRecurringMember: 3,
  ManualRecurringSeries: 4,
  TransactionAlias: 5,
  BankCategoryRule: 6,
  CategoryMapping: 7,
  Category: 8,
  ImportProfile: 9,
  UploadHistory: 10,
  BankTransaction: 11,
  CreditCardTransaction: 12,
  Account: 13,
} satisfies Record<Prisma.ModelName, number>

export type WipeTable = keyof typeof WIPE_ORDER

export const WIPE_TABLES = (Object.keys(WIPE_ORDER) as WipeTable[]).sort((a, b) => WIPE_ORDER[a] - WIPE_ORDER[b])

/**
 * Deletes every row of every data table in one transaction (ENG-62). The
 * schema and _prisma_migrations stay, so the app opens like a fresh install,
 * with no accounts and the starting categories. Returns how many rows went per table.
 *
 * Afterwards VACUUM rebuilds the database file, so the deleted rows don't
 * linger in its free pages. A failed VACUUM leaves the data deleted, just not
 * compacted, so it is not an error.
 */
export async function wipeAllData(): Promise<Record<WipeTable, number>> {
  const deleted = await prisma.$transaction(async tx => {
    const counts = {} as Record<WipeTable, number>
    // Table names come from the constant above, never from input
    for (const table of WIPE_TABLES) counts[table] = await tx.$executeRawUnsafe(`DELETE FROM "${table}"`)
    // A new install starts with the starting categories (ENG-76), so this does too
    await tx.category.createMany({ data: STARTING_CATEGORIES })
    return counts
  })
  try {
    await prisma.$executeRawUnsafe('VACUUM')
  } catch (e) {
    console.warn('wipeAllData: VACUUM failed', e)
  }
  return deleted
}
