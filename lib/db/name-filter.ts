/** An account page's merchant / free-text filter, which its charts follow as its table does (ENG-83) */
export interface NameFilter {
  /** An exact merchant (card) or description (bank) */
  merchant?: string
  /** Part of one */
  search?: string
}

/** The name condition for a Prisma where: an exact merchant wins over a search; undefined = any name */
export function nameMatch(filter: NameFilter): string | { contains: string } | undefined {
  if (filter.merchant) return filter.merchant
  if (filter.search) return { contains: filter.search }
  return undefined
}
