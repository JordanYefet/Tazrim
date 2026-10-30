import { prisma, type Db } from './client'

/**
 * Generic bank descriptions: wordings that only say how money moved (a cheque, a
 * transfer, a cash withdrawal), not who got it. A cheque can pay anyone, so a
 * BankCategoryRule for one would put every cheque in one category: their rows are
 * categorised one by one instead. Matched exactly against originalDescription, at
 * every bank. The starting list is in ./starting-generic-descriptions.ts.
 */

export class GenericDescriptionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function listGenericDescriptions(db: Db = prisma): Promise<string[]> {
  const rows = await db.genericDescription.findMany({ orderBy: { description: 'asc' } })
  return rows.map(r => r.description)
}

export async function isGenericDescription(originalDescription: string, db: Db = prisma): Promise<boolean> {
  return (await db.genericDescription.count({ where: { description: originalDescription } })) > 0
}

/**
 * Adds a description to the list, drops its rules (every bank, both directions) and
 * clears the categories they set. Rows set by hand keep theirs. Returns the cleared rows.
 */
export async function markGenericDescription(description: string): Promise<{ description: string; clearedIds: string[] }> {
  const text = description.trim()
  if (!text) throw new GenericDescriptionError('תיאור נדרש', 400)
  return prisma.$transaction(async db => {
    await db.genericDescription.upsert({ where: { description: text }, update: {}, create: { description: text } })
    await db.bankCategoryRule.deleteMany({ where: { originalDescription: text } })
    const cleared = await db.bankTransaction.findMany({
      where: { originalDescription: text, categoryManual: false, category: { not: null } },
      select: { id: true },
    })
    const clearedIds = cleared.map(r => r.id)
    await db.bankTransaction.updateMany({ where: { id: { in: clearedIds } }, data: { category: null } })
    return { description: text, clearedIds }
  })
}

/** Takes a description off the list; its rows keep their categories. */
export async function unmarkGenericDescription(description: string): Promise<void> {
  await prisma.genericDescription.deleteMany({ where: { description: description.trim() } })
}
