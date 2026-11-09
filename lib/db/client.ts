import { PrismaClient, type Prisma } from '@prisma/client'
import { vercelDemoDatabaseUrl } from './demo-database'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// TAZRIM_DATABASE_URL lets tests point Prisma at a throwaway SQLite file; the
// live demo on Vercel opens its copy of the demo database (./demo-database.ts);
// otherwise the URL in prisma/schema.prisma (prisma/tazrim.db) is used.
const datasourceUrl = process.env.TAZRIM_DATABASE_URL ?? vercelDemoDatabaseUrl()

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// WAL (ENG-89, was ENG-61): readers don't wait for a writer, so two people (or a
// sync and a page) use the app at once smoothly. The mode is stored in the file,
// so this only switches an older database once. The read-only demo is left as is,
// and so are tests: the switch runs unawaited and would race the sqlite3 CLI that
// seeds their throwaway files ("database is locked").
const g = globalThis as unknown as { tazrimWal?: Promise<unknown> }
const readOnly = process.env.TAZRIM_READ_ONLY === '1' || process.env.TAZRIM_READ_ONLY === 'true'
if (!g.tazrimWal && !readOnly && !process.env.VITEST) {
  g.tazrimWal = prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL').catch(() => {})
}

/**
 * The global client or an interactive transaction's client: write helpers
 * take one so a caller can run several of them in a single transaction.
 */
export type Db = Prisma.TransactionClient
