/**
 * What the upload page needs to map a file of a provider without a built-in
 * parser: the suggested mapping, the saved profile that fits the file (if any),
 * and the header signature that groups files sharing one mapping.
 */
import type { Account } from '@prisma/client'
import { candidateProfiles, findMatchingProfile, profileMapping } from '@/lib/db/import-profiles'
import {
  findHeaderRow,
  headerSignature,
  mappingKindOf,
  suggestMapping,
  type ImportMapping,
  type MappingKind,
} from '@/lib/import/mapping'
import type { RawWorkbook } from '@/lib/parsers/raw-grid'

export interface MapperInfo {
  kind: MappingKind
  suggestion: ImportMapping
  /** The saved profile whose header signature this file has */
  profile: { id: string; name: string; mapping: ImportMapping; linked: boolean } | null
  /** headerSignature at the mapping's header row: files with the same one share a mapping */
  signature: string
  /**
   * The account's own default profile, whether or not this file matches it:
   * re-mapping (ENG-65) starts from it when the file doesn't match any profile
   * (e.g. the saved header row was the mistake), and saves back into it.
   */
  accountProfile: { id: string; name: string; mapping: ImportMapping } | null
}

/** Null for account kinds that can't be mapped (trading, pension). */
export async function mapperFor(
  account: Pick<Account, 'id' | 'kind' | 'provider'>,
  workbook: Pick<RawWorkbook, 'sheets'>
): Promise<MapperInfo | null> {
  const kind = mappingKindOf(account.kind)
  if (!kind) return null
  // the first sheet that has a recognisable header, else the first one
  const found = workbook.sheets.findIndex(s => findHeaderRow(s, kind) !== -1)
  const sheetIndex = found === -1 ? 0 : found
  const sheet = workbook.sheets[sheetIndex]
  const suggestion = sheet
    ? suggestMapping(sheet, kind, sheetIndex)
    : suggestMapping({ rows: [] }, kind)

  const match = await findMatchingProfile(account, workbook)
  const mapping = match?.mapping ?? suggestion
  const signatureSheet = workbook.sheets[mapping.sheet]
  const own = (await candidateProfiles(account)).find(p => p.accountId === account.id)
  const ownMapping = own ? profileMapping(own) : null
  return {
    accountProfile: own && ownMapping ? { id: own.id, name: own.name, mapping: ownMapping } : null,
    kind,
    suggestion,
    profile: match
      ? { id: match.profile.id, name: match.profile.name, mapping: match.mapping, linked: match.profile.accountId === account.id }
      : null,
    signature: signatureSheet ? headerSignature(signatureSheet, mapping.headerRow) : '',
  }
}
