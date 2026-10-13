import { prisma } from './client'
import { PROVIDERS, type AccountKind } from './accounts'

/** The `source` the upload form sends -> the kind and provider of the account the file goes to. */
const UPLOAD_TARGETS: Record<string, { kind: AccountKind; provider: string }> = {
  BANK: { kind: 'BANK', provider: PROVIDERS.LEUMI },
  MAX: { kind: 'CREDIT_CARD', provider: PROVIDERS.MAX },
}

export function uploadTarget(source: string): { kind: AccountKind; provider: string } | null {
  return UPLOAD_TARGETS[source] ?? null
}

export async function recordUpload(params: {
  fileName: string
  recordCount: number
  accountId: string
}) {
  return prisma.uploadHistory.create({ data: params })
}

export async function hasUpload(accountId: string, fileName: string): Promise<boolean> {
  return (await prisma.uploadHistory.count({ where: { accountId, fileName } })) > 0
}

export async function getUploadHistory() {
  return prisma.uploadHistory.findMany({
    orderBy: { uploadedAt: 'desc' },
    include: { account: { select: { id: true, kind: true, provider: true, displayName: true } } },
  })
}

/** Deletes the upload record and the rows it brought into its account. */
export async function deleteUpload(id: string) {
  return prisma.$transaction(async (tx) => {
    const upload = await tx.uploadHistory.findUniqueOrThrow({ where: { id }, include: { account: true } })
    const { accountId } = upload
    if (upload.account.kind === 'BANK') {
      await tx.bankTransaction.deleteMany({ where: { accountId, sourceFile: upload.fileName } })
    } else if (upload.account.kind === 'CREDIT_CARD') {
      await tx.creditCardTransaction.deleteMany({
        where: {
          accountId,
          OR: [
            { sourceFile: upload.fileName },
            // pre-v1.4 rows have sourceFile="" — match them by account
            { sourceFile: '' },
          ],
        },
      })
    }
    await tx.uploadHistory.delete({ where: { id } })
  })
}
