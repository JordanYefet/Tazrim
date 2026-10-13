/**
 * Import an uploaded file into one chosen account, using the parser of that
 * account's provider. Dedupe and the "already uploaded" check are per account.
 */
import type { Account } from '@prisma/client'
import { parseBankLeumi } from '@/lib/parsers/bank-leumi'
import { parseMaxCC } from '@/lib/parsers/max-cc'
import { upsertBankTransactions } from '@/lib/db/bank'
import { upsertCCTransactions } from '@/lib/db/cards'
import { hasUpload, recordUpload } from '@/lib/db/upload'
import { PROVIDERS } from '@/lib/db/accounts'
import { prisma } from '@/lib/db/client'

export type ImportErrorCode = 'UNSUPPORTED_PROVIDER' | 'PARSE_ERROR' | 'DUPLICATE_FILE'

export type ImportResult =
  | { ok: true; created: number; skipped: number; newCategories?: string[] }
  | { ok: false; status: number; code: ImportErrorCode; error: string }

type ImportableAccount = Pick<Account, 'id' | 'kind' | 'provider'>

type Importer = (account: ImportableAccount, buffer: Buffer, fileName: string) => Promise<ImportResult>

const parseError = (error: string): ImportResult => ({ ok: false, status: 422, code: 'PARSE_ERROR', error })

const importLeumi: Importer = async (account, buffer, fileName) => {
  const { transactions, errors } = parseBankLeumi(buffer, fileName)
  if (errors.length) return parseError(errors[0])
  if (!transactions.length) return parseError('לא נמצאו עסקאות בקובץ')

  const result = await upsertBankTransactions(transactions, account.id)
  await recordUpload({ fileName, recordCount: result.created, accountId: account.id })
  return { ok: true, ...result }
}

const importMax: Importer = async (account, buffer, fileName) => {
  let parsed: ReturnType<typeof parseMaxCC>
  try {
    parsed = parseMaxCC(buffer)
  } catch {
    return parseError('לא ניתן לקרוא את הקובץ כקובץ מקס')
  }
  const { transactions, errors } = parsed
  if (errors.length) return parseError(errors[0])
  if (!transactions.length) return parseError('לא נמצאו עסקאות בקובץ')

  if (await hasUpload(account.id, fileName)) {
    return { ok: false, status: 409, code: 'DUPLICATE_FILE', error: 'קובץ זה כבר הועלה בעבר לחשבון הזה' }
  }

  const result = await upsertCCTransactions(transactions, fileName, account.id)
  await recordUpload({ fileName, recordCount: result.created, accountId: account.id })

  const txCategories = [...new Set(transactions.map(t => t.category).filter(Boolean))]
  const existing = await prisma.category.findMany({ where: { name: { in: txCategories } } })
  const existingNames = new Set(existing.map(c => c.name))
  const newCategories = txCategories.filter(name => !existingNames.has(name))

  return { ok: true, ...result, newCategories }
}

/** Parser per provider, and the account kind it produces rows for. */
const IMPORTERS: Record<string, { kind: Account['kind']; run: Importer }> = {
  [PROVIDERS.LEUMI]: { kind: 'BANK', run: importLeumi },
  [PROVIDERS.MAX]: { kind: 'CREDIT_CARD', run: importMax },
}

function importerFor(account: Pick<Account, 'kind' | 'provider'>): Importer | null {
  const entry = IMPORTERS[account.provider]
  return entry && entry.kind === account.kind ? entry.run : null
}

export function isImportSupported(account: Pick<Account, 'kind' | 'provider'>): boolean {
  return importerFor(account) !== null
}

export async function importUpload(account: ImportableAccount, buffer: Buffer, fileName: string): Promise<ImportResult> {
  const run = importerFor(account)
  if (!run) {
    return { ok: false, status: 422, code: 'UNSUPPORTED_PROVIDER', error: 'ייבוא עבור ספק זה עדיין לא נתמך' }
  }
  return run(account, buffer, fileName)
}
