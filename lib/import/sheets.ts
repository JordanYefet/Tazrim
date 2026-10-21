/**
 * Which sheets of a workbook a mapping reads, and where its header is in each
 * (ENG-69). Pure, so the upload preview can say what the import will read.
 *
 * - The header may sit lower or higher than when the mapping was saved (a few
 *   more title rows on top, as Leumi's HTML export has): the saved header row
 *   is looked for near the top and the mapping is shifted to it.
 * - Besides the mapping's own sheet, every other sheet with the same header row
 *   is read too (Max splits one export over several sheets, the not-yet-billed
 *   one included). Sheets with another header are not read.
 */
import type { RawSheet } from '@/lib/parsers/raw-grid'
import { headerSignature, type ImportMapping } from './mapping'

/** How far down a moved header row is looked for */
export const HEADER_SEARCH_ROWS = 100

/** `mapping` with its rows moved by `delta` (the header, the data range, a billing-date cell above the header). */
export function shiftMapping(mapping: ImportMapping, delta: number): ImportMapping {
  if (!delta) return mapping
  const next: ImportMapping = { ...mapping, headerRow: mapping.headerRow + delta }
  if (mapping.startRow !== undefined) next.startRow = mapping.startRow + delta
  if (mapping.endRow !== undefined) next.endRow = mapping.endRow + delta
  const b = mapping.billingDate
  if (b?.from === 'cell' && b.row + delta >= 0) next.billingDate = { ...b, row: b.row + delta }
  return next
}

/**
 * The mapping placed on `sheet`: as is when the sheet has `signature` at the
 * mapping's header row, else moved to the nearest row that has it; null when
 * no row near the top has it.
 */
export function locateHeader(sheet: Pick<RawSheet, 'rows'>, mapping: ImportMapping, signature: string): ImportMapping | null {
  if (!signature) return null
  if (headerSignature(sheet, mapping.headerRow) === signature) return mapping
  const limit = Math.min(sheet.rows.length, HEADER_SEARCH_ROWS)
  let best = -1
  for (let r = 0; r < limit; r++) {
    if (headerSignature(sheet, r) !== signature) continue
    if (best === -1 || Math.abs(r - mapping.headerRow) < Math.abs(best - mapping.headerRow)) best = r
  }
  return best === -1 ? null : shiftMapping(mapping, best - mapping.headerRow)
}

export interface MappedSheet {
  index: number
  mapping: ImportMapping
}

/**
 * Every sheet the import reads with `mapping`, the mapping's own sheet first
 * (as is when its header isn't found, so the usual errors show), then the
 * other sheets whose header matches. `signature` defaults to the header at
 * the mapping's own sheet and row.
 */
export function mappedSheets(
  workbook: { sheets: Pick<RawSheet, 'rows'>[] },
  mapping: ImportMapping,
  signature?: string
): MappedSheet[] {
  const own = workbook.sheets[mapping.sheet]
  if (!own) return []
  const sig = signature ?? headerSignature(own, mapping.headerRow)
  const out: MappedSheet[] = [{ index: mapping.sheet, mapping: locateHeader(own, mapping, sig) ?? mapping }]
  workbook.sheets.forEach((sheet, index) => {
    if (index === mapping.sheet) return
    const placed = locateHeader(sheet, { ...mapping, sheet: index }, sig)
    if (placed) out.push({ index, mapping: placed })
  })
  return out
}
