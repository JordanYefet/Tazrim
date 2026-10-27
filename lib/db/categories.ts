import type { CategoryKind } from '@prisma/client'
import { prisma } from './client'

export type { CategoryKind }

/** `kind` omitted = every category. Expense ones are for cards and bank debits, income ones for bank credits. */
export async function getCategories(kind?: CategoryKind) {
  return prisma.category.findMany({ where: kind ? { kind } : undefined, orderBy: { name: 'asc' } })
}

export async function createCategory(name: string, kind: CategoryKind = 'EXPENSE') {
  return prisma.category.create({ data: { name, kind } })
}

/**
 * Renames a category everywhere its name is stored: bank and card rows (with the
 * overrides set by hand), merchant rules, bank rules and issuer mappings. A card row
 * whose issuer category is unmapped carries the issuer's own name as its category; when
 * that name is the old one, the issuer category gets mapped to the new name, so the
 * next file of that provider arrives under it too.
 */
export async function renameCategory(id: string, name: string) {
  return prisma.$transaction(async db => {
    const before = await db.category.findUniqueOrThrow({ where: { id } })
    const old = before.name
    const updated = await db.category.update({ where: { id }, data: { name } })
    if (old === name) return updated

    const unmapped = await db.creditCardTransaction.findMany({
      where: { sourceCategory: old, category: old },
      select: { account: { select: { provider: true } } },
      distinct: ['accountId'],
    })
    for (const provider of new Set(unmapped.map(r => r.account.provider))) {
      await db.categoryMapping.upsert({
        where: { provider_sourceCategory: { provider, sourceCategory: old } },
        update: { category: name },
        create: { provider, sourceCategory: old, category: name },
      })
    }
    await db.categoryMapping.updateMany({ where: { category: old }, data: { category: name } })
    await db.creditCardTransaction.updateMany({ where: { category: old }, data: { category: name } })
    await db.creditCardTransaction.updateMany({ where: { categoryOverride: old }, data: { categoryOverride: name } })
    await db.transactionAlias.updateMany({ where: { categoryOverride: old }, data: { categoryOverride: name } })
    await db.bankTransaction.updateMany({ where: { category: old }, data: { category: name } })
    await db.bankCategoryRule.updateMany({ where: { category: old }, data: { category: name } })
    return updated
  })
}

export async function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } })
}

/** A `kind` value from a request, or undefined when it is missing or unknown */
export function parseCategoryKind(value: unknown): CategoryKind | undefined {
  return value === 'EXPENSE' || value === 'INCOME' ? value : undefined
}
