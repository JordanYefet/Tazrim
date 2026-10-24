import { NextResponse } from 'next/server'
import { readRawGrid, truncateWorkbook, RawGridError } from '@/lib/parsers/raw-grid'
import { MAX_PREVIEW_ROWS } from '@/lib/upload/preview-limits'
import { readUploadForm } from '@/lib/upload/form'
import { mapperFor } from '@/lib/upload/mapper-preview'

/**
 * Read-only: turns an uploaded file into a RawWorkbookPreview (the first
 * MAX_PREVIEW_ROWS rows of every sheet, plus counts) for the chosen account,
 * with `mapper`: the suggested mapping and the saved profile that matches the
 * file, if any. Every bank and card account imports through a mapping; other
 * kinds get no mapper. Nothing is saved.
 */
export async function POST(req: Request) {
  const input = await readUploadForm(req)
  if ('response' in input) return input.response
  const { file, account } = input

  try {
    const workbook = readRawGrid(await file.arrayBuffer(), file.name)
    const mapper = await mapperFor(account, workbook)
    return NextResponse.json({
      fileName: file.name,
      account: { id: account.id, kind: account.kind, provider: account.provider, displayName: account.displayName },
      importSupported: mapper !== null,
      mapper,
      ...truncateWorkbook(workbook, MAX_PREVIEW_ROWS),
    })
  } catch (e) {
    if (e instanceof RawGridError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 422 })
    }
    throw e
  }
}
