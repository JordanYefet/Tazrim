import type { Prisma } from '@prisma/client'
import { prisma } from './client'
import { STARTING_CATEGORIES } from './starting-categories'
import { STARTING_GENERIC_DESCRIPTIONS } from './starting-generic-descriptions'

/**
 * Every table, in the order its rows are deleted: rows that point at an
 * Account go before Account itself. It covers every Prisma.ModelName, so adding
 * a model to the schema fails type-checking until it is listed here.
 */
const WIPE_ORDER = {
  // The vault's sign-ins (ENG-90) point at accounts
  BankCredential: 0,
  UnusualDismissal: 1,
  RecurringSeriesOverride: 2,
  // members before their series (FK)
  ManualRecurringMember: 3,
  ManualRecurringSeries: 4,
  TransactionAlias: 5,
  BankCategoryRule: 6,
  CategoryKeywordRule: 7,
  GenericDescription: 8,
  CategoryMapping: 9,
  Category: 10,
  ImportProfile: 11,
  UploadHistory: 12,
  BankTransaction: 13,
  CreditCardTransaction: 14,
  SyncLink: 15,
  Account: 16,
  Setting: 17,
  // The login (ENG-89) goes too, so the app opens like a new install, at /setup.
  // Sessions and invites point at people and passkeys, passkeys at people.
  Session: 18,
  Invite: 19,
  // The vault key's copies point at passkeys
  VaultKeyWrap: 20,
  Passkey: 21,
  Person: 22,
}

WIPE_ORDER satisfies Record<Prisma.ModelName, number>

export type WipeTable = keyof typeof WIPE_ORDER

export const WIPE_TABLES = (Object.keys(WIPE_ORDER) as WipeTable[]).sort((a, b) => WIPE_ORDER[a] - WIPE_ORDER[b])

/**
 * Deletes every row of every table in one transaction (ENG-62). The schema
 * and _prisma_migrations stay, so the app opens like a fresh install: no
 * accounts and no people, the starting categories and the starting generic descriptions. Returns how many rows went per table.
 *
 * Afterwards VACUUM rebuilds the database file, so the deleted rows don't
 * linger in its free pages. A failed VACUUM leaves the data deleted, just not
 * compacted, so it is not an error.
 */
export async function wipeAllData(): Promise<Record<WipeTable, number>> {
  const deleted = await prisma.$transaction(async tx => {
    const counts = {} as Record<WipeTable, number>
    // Table names come from the constant above, never from input
    for (const table of WIPE_TABLES) {
      counts[table] = await tx.$executeRawUnsafe(`DELETE FROM "${table}"`)
    }
    // A new install starts with the starting categories (ENG-76), so this does too
    await tx.category.createMany({ data: STARTING_CATEGORIES })
    await tx.genericDescription.createMany({ data: STARTING_GENERIC_DESCRIPTIONS.map(description => ({ description })) })
    return counts
  })
  try {
    await prisma.$executeRawUnsafe('VACUUM')
  } catch (e) {
    console.warn('wipeAllData: VACUUM failed', e)
  }
  return deleted
}
