import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

// TAZRIM_DATABASE_URL lets tests point Prisma at a throwaway SQLite file;
// without it the URL in prisma/schema.prisma (prisma/tazrim.db) is used.
const datasourceUrl = process.env.TAZRIM_DATABASE_URL

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined)

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
