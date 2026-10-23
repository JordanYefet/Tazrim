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

export async function renameCategory(id: string, name: string) {
  return prisma.category.update({ where: { id }, data: { name } })
}

export async function deleteCategory(id: string) {
  return prisma.category.delete({ where: { id } })
}

/** A `kind` value from a request, or undefined when it is missing or unknown */
export function parseCategoryKind(value: unknown): CategoryKind | undefined {
  return value === 'EXPENSE' || value === 'INCOME' ? value : undefined
}
