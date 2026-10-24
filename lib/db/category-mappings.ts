import { prisma, type Db } from './client'

// Issuer categories mapped to yours (ENG-75). A card row keeps the issuer's category
// in `sourceCategory`; its `category` is yours: the mapped one, or the issuer's own
// name while it is unmapped. A category set by hand or by a merchant rule
// (`categoryOverride`) still wins over both.

export interface CategoryMappingInput {
  provider: string
  sourceCategory: string
  category: string
}

/** One issuer category found on the stored card rows, with what it is mapped to */
export interface IssuerCategory {
  provider: string
  sourceCategory: string
  /** Card rows with it */
  count: number
  /** Your category, or null while unmapped (the rows show the issuer's name) */
  category: string | null
}

/** sourceCategory -> your category, for one provider (card imports). */
export async function getCategoryMap(provider: string, db: Db = prisma): Promise<Map<string, string>> {
  const rows = await db.categoryMapping.findMany({ where: { provider } })
  return new Map(rows.map(m => [m.sourceCategory, m.category]))
}

/** Your category for a row of the file: the mapped one, or the issuer's own name. */
export function mappedCategory(map: Map<string, string>, sourceCategory: string): string {
  return map.get(sourceCategory) ?? sourceCategory
}

/** Every issuer category on the stored card rows, by provider then name, with its mapping. */
export async function getIssuerCategories(): Promise<IssuerCategory[]> {
  const [rows, mappings] = await Promise.all([
    prisma.$queryRaw<{ provider: string; sourceCategory: string; n: bigint | number }[]>`
      SELECT a."provider" AS provider, t."sourceCategory" AS sourceCategory, COUNT(*) AS n
      FROM "CreditCardTransaction" t JOIN "Account" a ON a."id" = t."accountId"
      WHERE t."sourceCategory" <> ''
      GROUP BY a."provider", t."sourceCategory"
      ORDER BY a."provider", t."sourceCategory"`,
    prisma.categoryMapping.findMany(),
  ])
  const mapped = new Map(mappings.map(m => [`${m.provider}\u0000${m.sourceCategory}`, m.category]))
  return rows.map(r => ({
    provider: r.provider,
    sourceCategory: r.sourceCategory,
    count: Number(r.n),
    category: mapped.get(`${r.provider}\u0000${r.sourceCategory}`) ?? null,
  }))
}

/**
 * Maps one issuer category to one of yours, and gives that provider's stored rows with
 * it your category. Mapping it to its own name is the same as removing the mapping.
 */
export async function saveCategoryMapping({ provider, sourceCategory, category }: CategoryMappingInput) {
  if (category === sourceCategory) return removeCategoryMapping(provider, sourceCategory)
  await prisma.$transaction([
    prisma.categoryMapping.upsert({
      where: { provider_sourceCategory: { provider, sourceCategory } },
      update: { category },
      create: { provider, sourceCategory, category },
    }),
    prisma.$executeRaw`
      UPDATE "CreditCardTransaction" SET "category" = ${category}
      WHERE "sourceCategory" = ${sourceCategory}
        AND "accountId" IN (SELECT "id" FROM "Account" WHERE "provider" = ${provider})`,
  ])
}

/** Removes a mapping: that provider's rows with the issuer category show the issuer's name again. */
export async function removeCategoryMapping(provider: string, sourceCategory: string) {
  await prisma.$transaction([
    prisma.categoryMapping.deleteMany({ where: { provider, sourceCategory } }),
    prisma.$executeRaw`
      UPDATE "CreditCardTransaction" SET "category" = "sourceCategory"
      WHERE "sourceCategory" = ${sourceCategory}
        AND "accountId" IN (SELECT "id" FROM "Account" WHERE "provider" = ${provider})`,
  ])
}
