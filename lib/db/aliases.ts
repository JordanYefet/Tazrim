import { prisma } from './client'
import { PROVIDERS } from './accounts'

/**
 * Merchant / description rules are keyed by provider ("leumi", "max", ...),
 * so a rule applies to every account of that provider.
 */
export interface AliasInput {
  provider: string
  originalName: string
  displayName: string
  categoryOverride?: string
}

const LEGACY_SOURCES: Record<string, string> = {
  BANK: PROVIDERS.LEUMI,
  MAX: PROVIDERS.MAX,
  HITECH: PROVIDERS.HITECH,
}

/** Provider key for an API value: legacy enum names (BANK/MAX/HITECH) map to their provider, anything else is lower-cased. */
export function normalizeProvider(value: string): string {
  const v = value.trim()
  return LEGACY_SOURCES[v] ?? v.toLowerCase()
}

export async function getAliases(provider?: string) {
  return prisma.transactionAlias.findMany({
    where: provider ? { provider } : undefined,
    orderBy: { originalName: 'asc' },
  })
}

/** originalName -> displayName for one provider's rules. */
export async function getAliasMap(provider: string): Promise<Map<string, string>> {
  const aliases = await prisma.transactionAlias.findMany({ where: { provider } })
  return new Map(aliases.map(a => [a.originalName, a.displayName]))
}

export async function upsertAlias(params: AliasInput) {
  return prisma.transactionAlias.upsert({
    where: { provider_originalName: { provider: params.provider, originalName: params.originalName } },
    update: { displayName: params.displayName, categoryOverride: params.categoryOverride },
    create: params,
  })
}

/** Saves the rule and applies it to the existing rows of every account of the provider. */
export async function upsertAliasAndBulkUpdate(params: AliasInput) {
  const alias = await upsertAlias(params)
  const ofProvider = { account: { provider: params.provider } }

  // Card rows: the rule carries a category. Bank rows: it renames the description.
  // A provider only has rows in one of the two tables, so at most one of these touches anything.
  if (params.categoryOverride) {
    await prisma.creditCardTransaction.updateMany({
      where: { originalMerchantName: params.originalName, ...ofProvider },
      data: { categoryOverride: params.categoryOverride },
    })
  }

  await prisma.bankTransaction.updateMany({
    where: { originalDescription: params.originalName, ...ofProvider },
    data: { description: params.displayName },
  })

  return alias
}

export async function deleteAlias(id: string) {
  return prisma.transactionAlias.delete({ where: { id } })
}
