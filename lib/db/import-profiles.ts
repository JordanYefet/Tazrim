/**
 * Saved column mappings (ENG-24). A profile belongs to an account kind and a
 * provider, and may be the default of one account. Its mapping is stored as
 * JSON and validated again on every read, so a bad row can never reach the
 * importer.
 */
import type { Account, ImportProfile } from '@prisma/client'
import { prisma } from './client'
import { mappingKindOf, validateMapping, type ImportMapping } from '@/lib/import/mapping'
import type { RawWorkbook } from '@/lib/parsers/raw-grid'
import { parseSnapshot, snapshotFromSignature, snapshotSignature, validateSnapshot, type HeaderSnapshot } from '@/lib/import/snapshot'
import { locateHeader } from '@/lib/import/sheets'

export type { ImportProfile }

export const PROFILE_NAME_MAX = 80
export const SIGNATURE_MAX = 4000

export class ProfileValidationError extends Error {
  constructor(
    public field: 'name' | 'mapping' | 'account' | 'headerSignature' | 'headers',
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

/** A snapshot from the client, checked, and matching the signature it is saved with. */
function checkHeaders(value: unknown, signature: string): string {
  const res = validateSnapshot(value)
  if (!res.ok) throw new ProfileValidationError('headers', res.error)
  if (snapshotSignature(res.snapshot) !== signature) {
    throw new ProfileValidationError('headers', 'הכותרות אינן תואמות לחתימת הכותרת')
  }
  return JSON.stringify(res.snapshot)
}

export type ProfileWithAccount = ImportProfile & {
  account: Pick<Account, 'id' | 'displayName' | 'kind' | 'provider'> | null
}

/** Every profile, newest first, with its linked account's name. */
export async function listImportProfiles(): Promise<ProfileWithAccount[]> {
  return prisma.importProfile.findMany({
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    include: { account: { select: { id: true, displayName: true, kind: true, provider: true } } },
  })
}

export async function getImportProfile(id: string): Promise<ImportProfile | null> {
  return prisma.importProfile.findUnique({ where: { id } })
}

export interface NewProfileInput {
  name: unknown
  mapping: unknown
  headerSignature: unknown
  /** HeaderSnapshot of the file (ENG-69), so the mapping can be edited without it later */
  headers?: unknown
  /** Make it the account's default profile */
  linkAccount?: boolean
}

/** Kind and provider come from the account; throws ProfileValidationError for bad input. */
export async function createImportProfile(account: ProfileAccount, input: NewProfileInput): Promise<ImportProfile> {
  const name = normalizeProfileName(input.name)
  const mapping = checkMapping(account, input.mapping)
  const signature = checkSignature(input.headerSignature)
  const headers = input.headers === undefined ? null : checkHeaders(input.headers, signature)
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
        headers,
        accountId: input.linkAccount ? account.id : null,
      },
    })
  })
}

/**
 * Rename and/or replace the mapping. Null when the profile does not exist.
 * A mapping made on a file comes with that file's `headerSignature` (and
 * `headers`); one edited without a file (ENG-69) leaves both out and keeps the
 * stored ones.
 */
export async function updateImportProfile(
  id: string,
  input: { name?: unknown; mapping?: unknown; headerSignature?: unknown; headers?: unknown }
): Promise<ImportProfile | null> {
  const profile = await getImportProfile(id)
  if (!profile) return null
  const data: { name?: string; mapping?: string; headerSignature?: string; headers?: string | null } = {}
  if (input.name !== undefined) data.name = normalizeProfileName(input.name)
  if (input.mapping !== undefined) {
    data.mapping = JSON.stringify(
      checkMapping({ id: profile.accountId ?? '', kind: profile.accountKind, provider: profile.provider }, input.mapping)
    )
    if (input.headerSignature !== undefined) data.headerSignature = checkSignature(input.headerSignature)
  }
  if (input.headers !== undefined) data.headers = checkHeaders(input.headers, data.headerSignature ?? profile.headerSignature)
  // A new file's header with no snapshot of it: the old snapshot no longer describes the file
  else if (data.headerSignature !== undefined && data.headerSignature !== profile.headerSignature) data.headers = null
  return prisma.importProfile.update({ where: { id }, data })
}

export interface ProfileForEdit {
  profile: ImportProfile
  kind: 'card' | 'bank'
  mapping: ImportMapping
  /** The stored header (and samples), or one rebuilt from the signature; null: a file is needed */
  snapshot: HeaderSnapshot | null
}

/**
 * What the file-less mapper (ENG-69) opens: the profile's mapping and its
 * header snapshot. Profiles saved before ENG-69 get their header back from
 * headerSignature (the normalized header text), without sample rows.
 * Null when the profile does not exist or its mapping is unreadable.
 */
export async function getProfileForEdit(id: string): Promise<ProfileForEdit | null> {
  const profile = await getImportProfile(id)
  const kind = profile && mappingKindOf(profile.accountKind)
  const mapping = profile && profileMapping(profile)
  if (!profile || !kind || !mapping) return null
  const snapshot = parseSnapshot(profile.headers) ?? snapshotFromSignature(profile.headerSignature)
  return { profile, kind, mapping, snapshot }
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
    // the saved header may sit a few rows lower or higher in this file (ENG-69)
    const placed = sheet && locateHeader(sheet, mapping, profile.headerSignature)
    if (placed) return { profile, mapping: placed }
  }
  return null
}

/** Drops the sample rows of the account's linked profiles (its transactions are being deleted). */
export async function dropProfileSamples(accountId: string, db: Pick<typeof prisma, 'importProfile'> = prisma): Promise<void> {
  for (const p of await db.importProfile.findMany({ where: { accountId }, select: { id: true, headers: true } })) {
    const snapshot = parseSnapshot(p.headers)
    if (snapshot?.samples.length) {
      await db.importProfile.update({ where: { id: p.id }, data: { headers: JSON.stringify({ ...snapshot, samples: [] }) } })
    }
  }
}
