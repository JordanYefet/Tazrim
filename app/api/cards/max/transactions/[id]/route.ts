import { NextRequest, NextResponse } from 'next/server'
import { updateCCTransaction, bulkUpdateCCCategory } from '@/lib/db/cards'
import { upsertAlias } from '@/lib/db/aliases'
import { prisma } from '@/lib/db/client'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()

  const tx = await prisma.creditCardTransaction.findUnique({ where: { id }, include: { account: true } })
  if (!tx) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })

  const updated = await updateCCTransaction(id, {
    merchantName: body.merchantName,
    categoryOverride: body.categoryOverride,
    ignored: body.ignored,
  })

  // Rules belong to the card's provider, so they cover every card of that provider
  const provider = tx.account.provider

  if (body.categoryOverride) {
    await bulkUpdateCCCategory(tx.originalMerchantName, body.categoryOverride, provider)
    await upsertAlias({
      provider,
      originalName: tx.originalMerchantName,
      displayName: tx.merchantName,
      categoryOverride: body.categoryOverride,
    })
  }

  if (body.merchantName) {
    await upsertAlias({
      provider,
      originalName: tx.originalMerchantName,
      displayName: body.merchantName,
      categoryOverride: body.categoryOverride,
    })
  }

  return NextResponse.json(updated)
}
