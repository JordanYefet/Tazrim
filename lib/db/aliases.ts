import { prisma } from './client'
import type { AliasSource } from '@prisma/client'

export async function getAliases(source?: AliasSource) {
  return prisma.transactionAlias.findMany({
    where: source ? { source } : undefined,
    orderBy: { originalName: 'asc' },
  })
}

export async function upsertAlias(params: {
  source: AliasSource
  originalName: string
  displayName: string
  categoryOverride?: string
}) {
  return prisma.transactionAlias.upsert({
    where: { source_originalName: { source: params.source, originalName: params.originalName } },
    update: { displayName: params.displayName, categoryOverride: params.categoryOverride },
    create: params,
  })
}

export async function upsertAliasAndBulkUpdate(params: {
  source: AliasSource
  originalName: string
  displayName: string
  categoryOverride?: string
}) {
  const alias = await prisma.transactionAlias.upsert({
    where: { source_originalName: { source: params.source, originalName: params.originalName } },
    update: { displayName: params.displayName, categoryOverride: params.categoryOverride },
    create: params,
  })

  if (params.categoryOverride && (params.source === 'MAX' || params.source === 'HITECH')) {
    await prisma.creditCardTransaction.updateMany({
      where: { originalMerchantName: params.originalName },
      data: { categoryOverride: params.categoryOverride },
    })
  }

  if (params.source === 'BANK') {
    await prisma.bankTransaction.updateMany({
      where: { originalDescription: params.originalName },
      data: { description: params.displayName },
    })
  }

  return alias
}

export async function deleteAlias(id: string) {
  return prisma.transactionAlias.delete({ where: { id } })
}
