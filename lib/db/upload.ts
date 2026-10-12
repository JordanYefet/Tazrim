import { prisma } from './client'
import type { AliasSource, CardProvider } from '@prisma/client'

export async function recordUpload(params: {
  fileName: string
  recordCount: number
  source: AliasSource
}) {
  return prisma.uploadHistory.create({ data: params })
}

export async function getUploadHistory() {
  return prisma.uploadHistory.findMany({ orderBy: { uploadedAt: 'desc' } })
}

export async function deleteUpload(id: string) {
  return prisma.$transaction(async (tx) => {
    const upload = await tx.uploadHistory.findUniqueOrThrow({ where: { id } })
    if (upload.source === 'BANK') {
      await tx.bankTransaction.deleteMany({ where: { sourceFile: upload.fileName } })
    } else if (upload.source === 'MAX' || upload.source === 'HITECH') {
      await tx.creditCardTransaction.deleteMany({
        where: {
          OR: [
            { sourceFile: upload.fileName },
            // pre-v1.4 rows have sourceFile="" — match them by provider
            { sourceFile: '', cardProvider: upload.source as CardProvider },
          ],
        },
      })
    }
    await tx.uploadHistory.delete({ where: { id } })
  })
}
