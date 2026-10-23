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

/**
 * The global client or an interactive transaction's client: write helpers
 * take one so a caller can run several of them in a single transaction.
 */
export type Db = Prisma.TransactionClient
