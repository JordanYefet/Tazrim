import type { Account, AccountKind } from '@prisma/client'
import { prisma } from './client'

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
