/**
 * Import an uploaded file into one chosen account, using the parser of that
 * account's provider, or a column mapping / saved profile for providers without
 * one. Dedupe and the "already uploaded" check are per account.
 *
 * Reading a file (parseUpload) is separate from storing its rows (storeRows),
 * so a re-import (ENG-65) can replace a file's earlier rows and store the new
 * ones through the same path, in one transaction.
 */
import type { Account } from '@prisma/client'
import { parseBankLeumi } from '@/lib/parsers/bank-leumi'
import { parseMaxCC } from '@/lib/parsers/max-cc'
import { upsertBankTransactions } from '@/lib/db/bank'
import { upsertCCTransactions } from '@/lib/db/cards'
import { recordUpload } from '@/lib/db/upload'
import { PROVIDERS } from '@/lib/db/accounts'
import { prisma, type Db } from '@/lib/db/client'
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
import { mappedSheets } from '@/lib/import/sheets'
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

export type ImportFailure = { ok: false; status: number; code: ImportErrorCode; error: string }

export type ImportResult =
  | { ok: true; created: number; skipped: number; skippedRows: SkippedRow[]; newCategories?: string[]; pending?: number }
  | ImportFailure

/** `customImport`: a Leumi or Max account set to import through its mapping (ENG-69) */
type ImportableAccount = Pick<Account, 'id' | 'kind' | 'provider'> & { customImport?: boolean }

export interface ImportOptions {
  /** File rows to import even though the account already has them (card accounts) */
  force?: number[]
  /** A column mapping from the client (validated here, never trusted) */
  mapping?: unknown
  /** A saved profile to map with */
  profileId?: string
}

/** A file read into rows, not stored yet. */
export type ParsedUpload =
  | { ok: true; kind: 'bank'; rows: ParsedBankTransaction[] }
  | { ok: true; kind: 'card'; rows: ParsedCCTransaction[]; pending?: number }
  | ImportFailure

type Parser = (account: ImportableAccount, buffer: Buffer, fileName: string, opts: ImportOptions) => Promise<ParsedUpload>

const parseError = (error: string): ImportFailure => ({ ok: false, status: 422, code: 'PARSE_ERROR', error })

/** Stores parsed bank rows (same path for the built-in parser and a mapping). */
async function storeBank(
  account: ImportableAccount,
  transactions: ParsedBankTransaction[],
  fileName: string,
  db: Db
): Promise<ImportResult> {
  const { created, skipped, skippedRows } = await upsertBankTransactions(transactions, account.id, db)
  await recordUpload({ fileName, recordCount: created, accountId: account.id }, db)
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
  opts: ImportOptions,
  db: Db
): Promise<ImportResult> {
  // A file uploaded before is compared row by row like any other, so uploading it
  // again only adds the rows that are missing (e.g. installments an older import dropped)
  const { created, skipped, skippedRows } = await upsertCCTransactions(
    transactions,
    fileName,
    account.id,
    { force: opts.force },
    db
  )
  await recordUpload({ fileName, recordCount: created, accountId: account.id }, db)

  const txCategories = [...new Set(transactions.map(t => t.category).filter(Boolean))]
  const existing = await db.category.findMany({ where: { name: { in: txCategories } } })
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

/** Stores rows parseUpload read, through the de-dup of the account's kind. */
function storeRows(
  account: ImportableAccount,
  parsed: Extract<ParsedUpload, { ok: true }>,
  fileName: string,
  opts: ImportOptions,
  db: Db = prisma
): Promise<ImportResult> {
  if (parsed.kind === 'bank') return storeBank(account, parsed.rows, fileName, db)
  // Rows the file holds but are not billed yet (Max), reported, never stored
  const pending = parsed.pending ?? 0
  return storeCard(account, parsed.rows, fileName, opts, db).then(r => (r.ok && pending ? { ...r, pending } : r))
}

const parseLeumi: Parser = async (_account, buffer, fileName) => {
  const { transactions, errors } = parseBankLeumi(buffer, fileName)
  if (errors.length) return parseError(errors[0])
  if (!transactions.length) return parseError('לא נמצאו עסקאות בקובץ')
  return { ok: true, kind: 'bank', rows: transactions }
}

const parseMax: Parser = async (_account, buffer) => {
  let parsed: ReturnType<typeof parseMaxCC>
  try {
    parsed = parseMaxCC(buffer)
  } catch {
    return parseError('לא ניתן לקרוא את הקובץ כקובץ מקס')
  }
  const { transactions, errors, pending } = parsed
  if (errors.length) return parseError(errors[0])
  if (!transactions.length) {
    return parseError(pending ? 'בקובץ יש רק עסקאות שטרם נקלטו, אין עדיין חיובים לייבא' : 'לא נמצאו עסקאות בקובץ')
  }
  return { ok: true, kind: 'card', rows: transactions, pending }
}

const invalidMapping = (error: string, status = 400): ImportFailure => ({ ok: false, status, code: 'INVALID_MAPPING', error })

/** "שורה 7: סכום חיוב – סכום לא תקין" (rows are 1-based, like the grid). */
export function mappingErrorText(e: MappingError): string {
  const what = `${FIELD_LABELS[e.field]} – ${e.message}`
  return e.row >= 0 ? `שורה ${e.row + 1}: ${what}` : what
}

/**
 * The mapped path (ENG-23/24): the mapping comes from the client (`mapping`) or a
 * saved profile (`profileId`), is validated here, and the rows then take the
 * same store path as the built-in parsers. Any row error refuses the whole file.
 *
 * Every sheet with the mapping's header row is read, not only the mapping's
 * own (ENG-69: Max splits an export over sheets), and the header may have
 * moved a few rows (lib/import/sheets). Card rows with no billing date are
 * left out and counted as pending, like the Max parser does.
 */
const parseMapped: Parser = async (account, buffer, fileName, opts) => {
  const kind = mappingKindOf(account.kind)
  if (!kind) return { ok: false, status: 422, code: 'UNSUPPORTED_PROVIDER', error: 'לא ניתן למפות קבצים לסוג חשבון זה' }

  let mapping: ImportMapping
  let signature: string | undefined
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
    signature = profile.headerSignature
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
  const sheets = mappedSheets(workbook, mapping, signature)
  if (!sheets.length) return parseError('הגיליון שבמיפוי לא נמצא בקובץ')

  const rows: (ParsedCCTransaction | ParsedBankTransaction)[] = []
  const errors: MappingError[] = []
  let pending = 0
  let failedSheet = ''
  for (const s of sheets) {
    const res = applyMapping(workbook.sheets[s.index], s.mapping, kind, { fileName })
    if (res.errors.length && !errors.length) failedSheet = workbook.sheets[s.index].name
    rows.push(...res.rows)
    errors.push(...res.errors)
    pending += res.pending
  }
  if (errors.length) {
    const more = errors.length > 1 ? ` (ועוד ${errors.length - 1})` : ''
    const where = sheets.length > 1 && failedSheet ? `גיליון ${failedSheet}, ` : ''
    return parseError(where + mappingErrorText(errors[0]) + more)
  }
  if (!rows.length) {
    return parseError(pending ? 'בקובץ יש רק עסקאות שטרם נקלטו, אין עדיין חיובים לייבא' : 'לא נמצאו עסקאות בקובץ')
  }
  return kind === 'card'
    ? { ok: true, kind: 'card', rows: rows as ParsedCCTransaction[], ...(pending ? { pending } : {}) }
    : { ok: true, kind: 'bank', rows: rows as ParsedBankTransaction[] }
}

/** Parser per provider, and the account kind it produces rows for. */
const PARSERS: Record<string, { kind: Account['kind']; run: Parser }> = {
  [PROVIDERS.LEUMI]: { kind: 'BANK', run: parseLeumi },
  [PROVIDERS.MAX]: { kind: 'CREDIT_CARD', run: parseMax },
}

function builtInParser(account: Pick<Account, 'kind' | 'provider'>): Parser | null {
  const entry = PARSERS[account.provider]
  return entry && entry.kind === account.kind ? entry.run : null
}

/** The provider has a built-in parser (whether or not the account uses it). */
export function hasBuiltInImport(account: Pick<Account, 'kind' | 'provider'>): boolean {
  return builtInParser(account) !== null
}

/** The parser the account imports with: none when it was switched to a custom mapping (ENG-69). */
function parserFor(account: Pick<Account, 'kind' | 'provider'> & { customImport?: boolean }): Parser | null {
  return account.customImport ? null : builtInParser(account)
}

/** The account's files are read by a built-in parser (not switched to a custom mapping). */
export function isImportSupported(account: Pick<Account, 'kind' | 'provider'> & { customImport?: boolean }): boolean {
  return parserFor(account) !== null
}

/** Reads the file into rows for the account (built-in parser, or the mapping / profile). Nothing is stored. */
export async function parseUpload(
  account: ImportableAccount,
  buffer: Buffer,
  fileName: string,
  opts: ImportOptions = {}
): Promise<ParsedUpload> {
  if (opts.mapping !== undefined || opts.profileId !== undefined) return parseMapped(account, buffer, fileName, opts)
  const run = parserFor(account)
  if (!run) {
    if (account.customImport && hasBuiltInImport(account)) {
      return invalidMapping('החשבון מוגדר לייבוא לפי מיפוי מותאם, ולא נשלח מיפוי', 400)
    }
    return { ok: false, status: 422, code: 'UNSUPPORTED_PROVIDER', error: 'ייבוא עבור ספק זה עדיין לא נתמך' }
  }
  return run(account, buffer, fileName, opts)
}

export async function importUpload(
  account: ImportableAccount,
  buffer: Buffer,
  fileName: string,
  opts: ImportOptions = {}
): Promise<ImportResult> {
  const parsed = await parseUpload(account, buffer, fileName, opts)
  if (!parsed.ok) return parsed
  return storeRows(account, parsed, fileName, opts)
}

/** Rows the account holds from one file (they carry its name in `sourceFile`). */
export async function countRowsFromFile(account: ImportableAccount, fileName: string, db: Db = prisma): Promise<number> {
  const where = { accountId: account.id, sourceFile: fileName }
  if (account.kind === 'BANK') return db.bankTransaction.count({ where })
  if (account.kind === 'CREDIT_CARD') return db.creditCardTransaction.count({ where })
  return 0
}

export type ReimportResult =
  /** dryRun: what a re-import would do, nothing written */
  | { ok: true; dryRun: true; existing: number; incoming: number }
  | (Extract<ImportResult, { ok: true }> & { dryRun: false; replaced: number })
  | ImportFailure

/**
 * Re-imports a file with a (corrected) mapping, ENG-65: the rows the account
 * got from a file of the same name, and that file's upload record, are
 * replaced by the file's rows read again, in one transaction. The new rows go
 * through the usual store path, so de-dup against the account's other files
 * still applies. Notes and category edits on the replaced rows are lost (the
 * window says so before confirming). `dryRun` only counts.
 */
export async function reimportUpload(
  account: ImportableAccount,
  buffer: Buffer,
  fileName: string,
  opts: ImportOptions & { dryRun?: boolean } = {}
): Promise<ReimportResult> {
  const parsed = await parseUpload(account, buffer, fileName, opts)
  if (!parsed.ok) return parsed
  if (opts.dryRun) {
    return { ok: true, dryRun: true, existing: await countRowsFromFile(account, fileName), incoming: parsed.rows.length }
  }
  return prisma.$transaction(
    async tx => {
      const where = { accountId: account.id, sourceFile: fileName }
      const removed =
        parsed.kind === 'card'
          ? await tx.creditCardTransaction.deleteMany({ where })
          : await tx.bankTransaction.deleteMany({ where })
      await tx.uploadHistory.deleteMany({ where: { accountId: account.id, fileName } })
      const stored = await storeRows(account, parsed, fileName, { force: opts.force }, tx)
      // Any failure rolls the whole re-import back, the deleted rows included
      if (!stored.ok) throw new Error(stored.error)
      return { ...stored, dryRun: false as const, replaced: removed.count }
    },
    // A statement can be a few thousand rows (bank rows are checked one by one)
    { timeout: 120_000, maxWait: 10_000 }
  )
}
