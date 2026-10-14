/**
 * Import an uploaded file into one chosen account, using the parser of that
 * account's provider, or a column mapping / saved profile for providers without
 * one. Dedupe and the "already uploaded" check are per account.
 */
import type { Account } from '@prisma/client'
import { parseBankLeumi } from '@/lib/parsers/bank-leumi'
import { parseMaxCC } from '@/lib/parsers/max-cc'
import { upsertBankTransactions } from '@/lib/db/bank'
import { upsertCCTransactions } from '@/lib/db/cards'
import { recordUpload } from '@/lib/db/upload'
import { PROVIDERS } from '@/lib/db/accounts'
import { prisma } from '@/lib/db/client'
import { getImportProfile, profileMapping } from '@/lib/db/import-profiles'
import {
  applyMapping,
  FIELD_LABELS,
  mappingKindOf,
  validateMapping,
  type ImportMapping,
  type MappingError,
} from '@/lib/import/mapping'
import { readRawGrid, RawGridError, type RawWorkbook } from '@/lib/parsers/raw-grid'
import type { ParsedBankTransaction, ParsedCCTransaction } from '@/lib/parsers/types'

export type ImportErrorCode = 'UNSUPPORTED_PROVIDER' | 'PARSE_ERROR' | 'INVALID_MAPPING' | 'PROFILE_NOT_FOUND'

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
  /** A column mapping from the client (validated here, never trusted) */
  mapping?: unknown
  /** A saved profile to map with */
  profileId?: string
}

type Importer = (account: ImportableAccount, buffer: Buffer, fileName: string, opts: ImportOptions) => Promise<ImportResult>

const parseError = (error: string): ImportResult => ({ ok: false, status: 422, code: 'PARSE_ERROR', error })

/** Stores parsed bank rows (same path for the built-in parser and a mapping). */
async function storeBank(account: ImportableAccount, transactions: ParsedBankTransaction[], fileName: string): Promise<ImportResult> {
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

/** Stores parsed card rows: one-to-one de-dup, `force`, upload record, new categories. */
async function storeCard(
  account: ImportableAccount,
  transactions: ParsedCCTransaction[],
  fileName: string,
  opts: ImportOptions
): Promise<ImportResult> {
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

const importLeumi: Importer = async (account, buffer, fileName) => {
  const { transactions, errors } = parseBankLeumi(buffer, fileName)
  if (errors.length) return parseError(errors[0])
  if (!transactions.length) return parseError('לא נמצאו עסקאות בקובץ')
  return storeBank(account, transactions, fileName)
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
  return storeCard(account, transactions, fileName, opts)
}

const invalidMapping = (error: string, status = 400): ImportResult => ({ ok: false, status, code: 'INVALID_MAPPING', error })

/** "שורה 7: סכום חיוב – סכום לא תקין" (rows are 1-based, like the grid). */
export function mappingErrorText(e: MappingError): string {
  const what = `${FIELD_LABELS[e.field]} – ${e.message}`
  return e.row >= 0 ? `שורה ${e.row + 1}: ${what}` : what
}

/**
 * The mapped path (ENG-23/24): the mapping comes from the client (`mapping`) or a
 * saved profile (`profileId`), is validated here, and the rows then take the
 * same store path as the built-in parsers. Any row error refuses the whole file.
 */
async function importMapped(account: ImportableAccount, buffer: Buffer, fileName: string, opts: ImportOptions): Promise<ImportResult> {
  const kind = mappingKindOf(account.kind)
  if (!kind) return { ok: false, status: 422, code: 'UNSUPPORTED_PROVIDER', error: 'לא ניתן למפות קבצים לסוג חשבון זה' }

  let mapping: ImportMapping
  if (opts.profileId !== undefined) {
    const profile = await getImportProfile(opts.profileId)
    const fits =
      profile &&
      profile.accountKind === account.kind &&
      (profile.accountId === account.id || profile.provider === account.provider)
    if (!profile || !fits) return { ok: false, status: 404, code: 'PROFILE_NOT_FOUND', error: 'המיפוי השמור לא נמצא לחשבון זה' }
    const stored = profileMapping(profile)
    if (!stored) return invalidMapping('המיפוי השמור אינו תקין', 422)
    mapping = stored
  } else {
    const res = validateMapping(opts.mapping, kind)
    if (!res.ok) return invalidMapping(res.error)
    mapping = res.mapping
  }

  let workbook: RawWorkbook
  try {
    workbook = readRawGrid(buffer, fileName)
  } catch (e) {
    if (e instanceof RawGridError) return parseError(e.message)
    throw e
  }
  const sheet = workbook.sheets[mapping.sheet]
  if (!sheet) return parseError('הגיליון שבמיפוי לא נמצא בקובץ')

  const { rows, errors } = applyMapping(sheet, mapping, kind, { fileName })
  if (errors.length) {
    const more = errors.length > 1 ? ` (ועוד ${errors.length - 1})` : ''
    return parseError(mappingErrorText(errors[0]) + more)
  }
  if (!rows.length) return parseError('לא נמצאו עסקאות בקובץ')
  return kind === 'card'
    ? storeCard(account, rows as ParsedCCTransaction[], fileName, opts)
    : storeBank(account, rows as ParsedBankTransaction[], fileName)
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
  if (opts.mapping !== undefined || opts.profileId !== undefined) return importMapped(account, buffer, fileName, opts)
  const run = importerFor(account)
  if (!run) {
    return { ok: false, status: 422, code: 'UNSUPPORTED_PROVIDER', error: 'ייבוא עבור ספק זה עדיין לא נתמך' }
  }
  return run(account, buffer, fileName, opts)
}
