/**
 * Saved column mappings (ENG-24). A profile belongs to an account kind and a
 * provider, and may be the default of one account. Its mapping is stored as
 * JSON and validated again on every read, so a bad row can never reach the
 * importer.
 */
import type { Account, ImportProfile } from '@prisma/client'
import { prisma } from './client'
import { headerSignature, mappingKindOf, validateMapping, type ImportMapping } from '@/lib/import/mapping'
import type { RawWorkbook } from '@/lib/parsers/raw-grid'

export type { ImportProfile }

export const PROFILE_NAME_MAX = 80
export const SIGNATURE_MAX = 4000

export class ProfileValidationError extends Error {
  constructor(
    public field: 'name' | 'mapping' | 'account' | 'headerSignature',
    message: string
  ) {
    super(message)
    this.name = 'ProfileValidationError'
  }
}

export function normalizeProfileName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name) throw new ProfileValidationError('name', 'שם המיפוי נדרש')
  if (name.length > PROFILE_NAME_MAX) {
    throw new ProfileValidationError('name', `השם ארוך מדי (עד ${PROFILE_NAME_MAX} תווים)`)
  }
  return name
}

type ProfileAccount = Pick<Account, 'id' | 'kind' | 'provider'>

/** The profile's mapping, validated for its kind; null when the stored JSON is not a valid mapping. */
export function profileMapping(profile: Pick<ImportProfile, 'mapping' | 'accountKind'>): ImportMapping | null {
  const kind = mappingKindOf(profile.accountKind)
  if (!kind) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(profile.mapping)
  } catch {
    return null
  }
  const res = validateMapping(parsed, kind)
  return res.ok ? res.mapping : null
}

function checkMapping(account: ProfileAccount, mapping: unknown): ImportMapping {
  const kind = mappingKindOf(account.kind)
  if (!kind) throw new ProfileValidationError('account', 'לא ניתן לשמור מיפוי לסוג חשבון זה')
  const res = validateMapping(mapping, kind)
  if (!res.ok) throw new ProfileValidationError('mapping', res.error)
  return res.mapping
}

function checkSignature(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > SIGNATURE_MAX) {
    throw new ProfileValidationError('headerSignature', 'חתימת כותרת לא תקינה')
  }
  return value
}

export type ProfileWithAccount = ImportProfile & { account: Pick<Account, 'id' | 'displayName'> | null }

/** Every profile, newest first, with its linked account's name. */
export async function listImportProfiles(): Promise<ProfileWithAccount[]> {
  return prisma.importProfile.findMany({
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: { account: { select: { id: true, displayName: true } } },
  })
}

export async function getImportProfile(id: string): Promise<ImportProfile | null> {
  return prisma.importProfile.findUnique({ where: { id } })
}

export interface NewProfileInput {
  name: unknown
  mapping: unknown
  headerSignature: unknown
  /** Make it the account's default profile */
  linkAccount?: boolean
}

/** Kind and provider come from the account; throws ProfileValidationError for bad input. */
export async function createImportProfile(account: ProfileAccount, input: NewProfileInput): Promise<ImportProfile> {
  const name = normalizeProfileName(input.name)
  const mapping = checkMapping(account, input.mapping)
  const signature = checkSignature(input.headerSignature)
  return prisma.$transaction(async tx => {
    // One default profile per account
    if (input.linkAccount) await tx.importProfile.updateMany({ where: { accountId: account.id }, data: { accountId: null } })
    return tx.importProfile.create({
      data: {
        name,
        accountKind: account.kind,
        provider: account.provider,
        mapping: JSON.stringify(mapping),
        headerSignature: signature,
        accountId: input.linkAccount ? account.id : null,
      },
    })
  })
}

/** Rename and/or replace the mapping. Null when the profile does not exist. */
export async function updateImportProfile(
  id: string,
  input: { name?: unknown; mapping?: unknown; headerSignature?: unknown }
): Promise<ImportProfile | null> {
  const profile = await getImportProfile(id)
  if (!profile) return null
  const data: { name?: string; mapping?: string; headerSignature?: string } = {}
  if (input.name !== undefined) data.name = normalizeProfileName(input.name)
  if (input.mapping !== undefined) {
    data.mapping = JSON.stringify(
      checkMapping({ id: profile.accountId ?? '', kind: profile.accountKind, provider: profile.provider }, input.mapping)
    )
    data.headerSignature = checkSignature(input.headerSignature)
  }
  return prisma.importProfile.update({ where: { id }, data })
}

export async function deleteImportProfile(id: string): Promise<boolean> {
  const { count } = await prisma.importProfile.deleteMany({ where: { id } })
  return count > 0
}

/** Profiles that may apply to an account: its default first, then same kind + provider, newest first. */
export async function candidateProfiles(account: ProfileAccount): Promise<ImportProfile[]> {
  const rows = await prisma.importProfile.findMany({
    where: { OR: [{ accountId: account.id }, { accountKind: account.kind, provider: account.provider }] },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
  })
  // a profile of another kind linked to this account can't parse its rows
  return rows
    .filter(p => p.accountKind === account.kind)
    .sort((a, b) => Number(b.accountId === account.id) - Number(a.accountId === account.id))
}

/**
 * The profile whose header signature the workbook has at the profile's own
 * sheet and header row, or null.
 */
export async function findMatchingProfile(
  account: ProfileAccount,
  workbook: Pick<RawWorkbook, 'sheets'>
): Promise<{ profile: ImportProfile; mapping: ImportMapping } | null> {
  for (const profile of await candidateProfiles(account)) {
    const mapping = profileMapping(profile)
    const sheet = mapping && workbook.sheets[mapping.sheet]
    if (sheet && headerSignature(sheet, mapping.headerRow) === profile.headerSignature) return { profile, mapping }
  }
  return null
}
