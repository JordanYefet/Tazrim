import type { Account, AccountKind } from '@prisma/client'
import { prisma } from './client'
import { CARD_NETWORKS, isCardNetwork, type CardNetwork } from '@/lib/accounts/brands'

export type { Account, AccountKind }

/** Provider keys used by Account.provider and TransactionAlias.provider. */
export const PROVIDERS = {
  LEUMI: 'leumi',
  MAX: 'max',
  HITECH: 'hitech',
} as const

export interface AccountQuery {
  kind?: AccountKind
  provider?: string
  /** Archived accounts are left out unless this is true. */
  includeArchived?: boolean
}

/**
 * Which accounts a transaction query covers: one account id, a list of ids,
 * or `undefined` for every account in the table (all bank accounts for
 * BankTransaction, all cards for CreditCardTransaction).
 */
export type AccountFilter = string | string[] | undefined

const ORDER = [{ createdAt: 'asc' as const }, { id: 'asc' as const }]

function accountQueryWhere({ kind, provider, includeArchived }: AccountQuery) {
  return {
    ...(kind ? { kind } : {}),
    ...(provider ? { provider } : {}),
    ...(includeArchived ? {} : { archived: false }),
  }
}

/** Accounts, oldest first. */
export async function listAccounts(query: AccountQuery = {}): Promise<Account[]> {
  return prisma.account.findMany({ where: accountQueryWhere(query), orderBy: ORDER })
}

export async function listAccountIds(query: AccountQuery = {}): Promise<string[]> {
  const rows = await prisma.account.findMany({
    where: accountQueryWhere(query),
    orderBy: ORDER,
    select: { id: true },
  })
  return rows.map(r => r.id)
}

/**
 * Ids of the non-archived accounts of a kind, oldest first: what the
 * dashboard totals cover. Archived accounts keep their data but drop out.
 */
export async function activeAccountIds(kind: AccountKind): Promise<string[]> {
  return listAccountIds({ kind })
}

export async function getAccount(id: string): Promise<Account | null> {
  return prisma.account.findUnique({ where: { id } })
}

/**
 * The account new uploads of this kind (and provider) go to: the oldest
 * account that is not archived. Null when there is none.
 */
export async function getDefaultAccount(kind: AccountKind, provider?: string): Promise<Account | null> {
  return prisma.account.findFirst({
    where: accountQueryWhere({ kind, provider }),
    orderBy: ORDER,
  })
}

/** Prisma `where` fragment for an AccountFilter. */
export function accountWhere(filter: AccountFilter): { accountId?: string | { in: string[] } } {
  if (filter === undefined) return {}
  if (Array.isArray(filter)) return { accountId: { in: filter } }
  return { accountId: filter }
}

// ---------------------------------------------------------------------------
// Account management (ENG-21)
// ---------------------------------------------------------------------------

/** Kinds that can be created from the UI. TRADING and PENSION are reserved. */
export const CREATABLE_KINDS = ['BANK', 'CREDIT_CARD'] as const
export type CreatableKind = (typeof CREATABLE_KINDS)[number]

export const DISPLAY_NAME_MAX = 60
export const PROVIDER_MAX = 40

/** Thrown for invalid input; API routes turn it into a 400. */
export class AccountValidationError extends Error {
  constructor(
    public field: 'kind' | 'provider' | 'displayName' | 'cardLastFour' | 'cardNetwork' | 'archived',
    message: string
  ) {
    super(message)
    this.name = 'AccountValidationError'
  }
}

export interface NewAccountInput {
  kind: unknown
  provider: unknown
  displayName: unknown
  cardLastFour?: unknown
  cardNetwork?: unknown
}

export function normalizeDisplayName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name) throw new AccountValidationError('displayName', 'שם החשבון נדרש')
  if (name.length > DISPLAY_NAME_MAX) {
    throw new AccountValidationError('displayName', `שם החשבון ארוך מדי (עד ${DISPLAY_NAME_MAX} תווים)`)
  }
  return name
}

/** Provider keys are lowercase: letters (any script), digits, space, "-" and "_". */
export function normalizeProvider(value: unknown): string {
  const provider = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : ''
  if (!provider) throw new AccountValidationError('provider', 'ספק נדרש')
  if (provider.length > PROVIDER_MAX || !/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u.test(provider)) {
    throw new AccountValidationError('provider', 'שם ספק לא תקין')
  }
  return provider
}

/**
 * Card network (ENG-56): one of CARD_NETWORKS' keys, any case. null, '' and
 * 'other' clear it (unknown / other network). Cards only.
 */
export function normalizeCardNetwork(value: unknown, kind: string): CardNetwork | null {
  if (value === undefined || value === null) return null
  const v = typeof value === 'string' ? value.trim().toLowerCase() : value
  if (v === '' || v === 'other') return null
  if (kind !== 'CREDIT_CARD') {
    throw new AccountValidationError('cardNetwork', 'רשת כרטיס רלוונטית רק לכרטיסי אשראי')
  }
  if (!isCardNetwork(v)) {
    throw new AccountValidationError(
      'cardNetwork',
      `רשת כרטיס לא מוכרת (אחת מ: ${CARD_NETWORKS.map(n => n.label).join(', ')})`
    )
  }
  return v
}

/** Validates and normalizes the input of createAccount. Throws AccountValidationError. */
export function validateNewAccount(input: NewAccountInput): {
  kind: CreatableKind
  provider: string
  displayName: string
  cardLastFour: string | null
  cardNetwork: CardNetwork | null
} {
  const kind = input.kind
  if (typeof kind !== 'string' || !(CREATABLE_KINDS as readonly string[]).includes(kind)) {
    throw new AccountValidationError('kind', 'סוג חשבון לא נתמך')
  }
  const provider = normalizeProvider(input.provider)
  const displayName = normalizeDisplayName(input.displayName)

  const raw = input.cardLastFour
  let cardLastFour: string | null = null
  if (raw !== undefined && raw !== null && raw !== '') {
    if (kind !== 'CREDIT_CARD') {
      throw new AccountValidationError('cardLastFour', '4 ספרות אחרונות רלוונטיות רק לכרטיסי אשראי')
    }
    const s = typeof raw === 'string' ? raw.trim() : ''
    if (!/^\d{4}$/.test(s)) throw new AccountValidationError('cardLastFour', 'יש להזין בדיוק 4 ספרות')
    cardLastFour = s
  }
  const cardNetwork = normalizeCardNetwork(input.cardNetwork, kind)
  return { kind: kind as CreatableKind, provider, displayName, cardLastFour, cardNetwork }
}

export async function createAccount(input: NewAccountInput): Promise<Account> {
  return prisma.account.create({ data: validateNewAccount(input) })
}

/** Null when the account does not exist. Throws AccountValidationError for a bad name. */
export async function renameAccount(id: string, displayName: unknown): Promise<Account | null> {
  const name = normalizeDisplayName(displayName)
  const { count } = await prisma.account.updateMany({ where: { id }, data: { displayName: name } })
  return count ? getAccount(id) : null
}

/**
 * Sets or clears a card's network. Null when the account does not exist.
 * Throws AccountValidationError for an unknown network or a bank account.
 */
export async function setCardNetwork(id: string, network: unknown): Promise<Account | null> {
  const account = await getAccount(id)
  if (!account) return null
  const cardNetwork = normalizeCardNetwork(network, account.kind)
  return prisma.account.update({ where: { id }, data: { cardNetwork } })
}

/**
 * Archive or restore. Archived accounts keep their data but drop out of
 * listAccounts' defaults (and so out of the upload picker). Null when the
 * account does not exist.
 */
export async function setArchived(id: string, archived: boolean): Promise<Account | null> {
  const { count } = await prisma.account.updateMany({ where: { id }, data: { archived } })
  return count ? getAccount(id) : null
}

export interface AccountCounts {
  bankTransactions: number
  creditCardTransactions: number
  uploads: number
}

export type AccountWithCounts = Account & { counts: AccountCounts; transactionCount: number }

/** Every account (archived included), oldest first, with row counts. */
export async function listAccountsWithCounts(): Promise<AccountWithCounts[]> {
  const rows = await prisma.account.findMany({
    orderBy: ORDER,
    include: { _count: { select: { bankTransactions: true, creditCardTransactions: true, uploads: true } } },
  })
  return rows.map(({ _count, ...account }) => ({
    ...account,
    counts: _count,
    transactionCount: _count.bankTransactions + _count.creditCardTransactions,
  }))
}

export interface DeletedCounts extends AccountCounts {
  recurringOverrides: number
  unusualDismissals: number
}

export type DeleteAccountResult =
  | { status: 'deleted'; deleted: DeletedCounts }
  | { status: 'not_found' }
  /** The only account of its kind (archived ones included). */
  | { status: 'last_of_kind' }
  /** The account has transactions and `confirmName` did not match its display name. */
  | { status: 'confirmation_required' }

/**
 * Deletes an account with its transactions, upload history, recurring-series
 * overrides and unusual-transaction dismissals, in one DB transaction.
 *
 * An account that has transactions is only deleted when `confirmName` equals
 * its display name (the UI makes the user type it). The last account of a kind
 * (archived ones included) is never deleted, so the kind always has an account
 * getDefaultAccount can fall back to once restored; archive it instead.
 */
export async function deleteAccount(id: string, opts: { confirmName?: unknown } = {}): Promise<DeleteAccountResult> {
  return prisma.$transaction(async tx => {
    const account = await tx.account.findUnique({
      where: { id },
      include: { _count: { select: { bankTransactions: true, creditCardTransactions: true } } },
    })
    if (!account) return { status: 'not_found' as const }

    const sameKind = await tx.account.count({ where: { kind: account.kind } })
    if (sameKind <= 1) return { status: 'last_of_kind' as const }

    const hasTransactions = account._count.bankTransactions + account._count.creditCardTransactions > 0
    const typed = typeof opts.confirmName === 'string' ? opts.confirmName.trim() : undefined
    if (hasTransactions && typed !== account.displayName) return { status: 'confirmation_required' as const }

    // Dismissals have no FK; match them through the account's transaction ids (before those go).
    const bankDismissals = await tx.$executeRaw`
      DELETE FROM "UnusualDismissal" WHERE "source" = 'bank'
        AND "transactionId" IN (SELECT "id" FROM "BankTransaction" WHERE "accountId" = ${id})`
    const cardDismissals = await tx.$executeRaw`
      DELETE FROM "UnusualDismissal" WHERE "source" = 'card'
        AND "transactionId" IN (SELECT "id" FROM "CreditCardTransaction" WHERE "accountId" = ${id})`

    // Overrides store the account id, and their keys start with "<source>|<accountId>|".
    const overrides = await tx.recurringSeriesOverride.deleteMany({
      where: {
        OR: [
          { accountId: id },
          { baseKey: { startsWith: `bank|${id}|` } },
          { baseKey: { startsWith: `card|${id}|` } },
        ],
      },
    })
    const bank = await tx.bankTransaction.deleteMany({ where: { accountId: id } })
    const cards = await tx.creditCardTransaction.deleteMany({ where: { accountId: id } })
    const uploads = await tx.uploadHistory.deleteMany({ where: { accountId: id } })
    await tx.account.delete({ where: { id } })

    return {
      status: 'deleted' as const,
      deleted: {
        bankTransactions: bank.count,
        creditCardTransactions: cards.count,
        uploads: uploads.count,
        recurringOverrides: overrides.count,
        unusualDismissals: bankDismissals + cardDismissals,
      },
    }
  })
}
