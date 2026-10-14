/**
 * Import an uploaded file into one chosen account, using the parser of that
 * account's provider. Dedupe and the "already uploaded" check are per account.
 */
import type { Account } from '@prisma/client'
import { parseBankLeumi } from '@/lib/parsers/bank-leumi'
import { parseMaxCC } from '@/lib/parsers/max-cc'
import { upsertBankTransactions } from '@/lib/db/bank'
import { upsertCCTransactions } from '@/lib/db/cards'
import { recordUpload } from '@/lib/db/upload'
import { PROVIDERS } from '@/lib/db/accounts'
import { prisma } from '@/lib/db/client'

export type ImportErrorCode = 'UNSUPPORTED_PROVIDER' | 'PARSE_ERROR'

/** A file row that was not imported because the account already has it. */
export interface SkippedRow {
  /** Position in the file; pass it in `force` to import the row anyway (card accounts) */
  index: number
  /** Purchase or value day, YYYY-MM-DD */
  date: string
  /** Card rows: the statement's billing day */
  billingDate?: string
  description: string
  amount: number
  notes?: string
  /** File the matching stored row came from */
  matchedFile: string
}

export type ImportResult =
  | { ok: true; created: number; skipped: number; skippedRows: SkippedRow[]; newCategories?: string[] }
  | { ok: false; status: number; code: ImportErrorCode; error: string }

type ImportableAccount = Pick<Account, 'id' | 'kind' | 'provider'>

export interface ImportOptions {
  /** File rows to import even though the account already has them (card accounts) */
  force?: number[]
}

type Importer = (account: ImportableAccount, buffer: Buffer, fileName: string, opts: ImportOptions) => Promise<ImportResult>

const parseError = (error: string): ImportResult => ({ ok: false, status: 422, code: 'PARSE_ERROR', error })

const importLeumi: Importer = async (account, buffer, fileName) => {
  const { transactions, errors } = parseBankLeumi(buffer, fileName)
  if (errors.length) return parseError(errors[0])
  if (!transactions.length) return parseError('לא נמצאו עסקאות בקובץ')

  const { created, skipped, skippedRows } = await upsertBankTransactions(transactions, account.id)
  await recordUpload({ fileName, recordCount: created, accountId: account.id })
  return {
    ok: true,
    created,
    skipped,
    skippedRows: skippedRows.map(r => ({
      index: r.index,
      date: r.date,
      description: r.description,
      amount: r.amount,
      matchedFile: r.matched.sourceFile,
    })),
  }
}

const importMax: Importer = async (account, buffer, fileName, opts) => {
  let parsed: ReturnType<typeof parseMaxCC>
  try {
    parsed = parseMaxCC(buffer)
  } catch {
    return parseError('לא ניתן לקרוא את הקובץ כקובץ מקס')
  }
  const { transactions, errors } = parsed
  if (errors.length) return parseError(errors[0])
  if (!transactions.length) return parseError('לא נמצאו עסקאות בקובץ')

  // A file uploaded before is compared row by row like any other, so uploading it
  // again only adds the rows that are missing (e.g. installments an older import dropped)
  const { created, skipped, skippedRows } = await upsertCCTransactions(transactions, fileName, account.id, {
    force: opts.force,
  })
  await recordUpload({ fileName, recordCount: created, accountId: account.id })

  const txCategories = [...new Set(transactions.map(t => t.category).filter(Boolean))]
  const existing = await prisma.category.findMany({ where: { name: { in: txCategories } } })
  const existingNames = new Set(existing.map(c => c.name))
  const newCategories = txCategories.filter(name => !existingNames.has(name))

  return {
    ok: true,
    created,
    skipped,
    skippedRows: skippedRows.map(r => ({
      index: r.index,
      date: r.date,
      billingDate: r.billingDate,
      description: r.merchant,
      amount: r.amount,
      notes: r.notes,
      matchedFile: r.matched.sourceFile,
    })),
    newCategories,
  }
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

export async function importUpload(
  account: ImportableAccount,
  buffer: Buffer,
  fileName: string,
  opts: ImportOptions = {}
): Promise<ImportResult> {
  const run = importerFor(account)
  if (!run) {
    return { ok: false, status: 422, code: 'UNSUPPORTED_PROVIDER', error: 'ייבוא עבור ספק זה עדיין לא נתמך' }
  }
  return run(account, buffer, fileName, opts)
}
