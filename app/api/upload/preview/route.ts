import { NextResponse } from 'next/server'
import { readRawGrid, truncateWorkbook, RawGridError } from '@/lib/parsers/raw-grid'
import { MAX_FILE_BYTES, MAX_PREVIEW_ROWS } from '@/lib/upload/preview-limits'

/**
 * Read-only: turns an uploaded file into a RawWorkbookPreview (the first
 * MAX_PREVIEW_ROWS rows of every sheet, plus counts). Nothing is saved.
 */
export async function POST(req: Request) {
  let file: FormDataEntryValue | null
  try {
    file = (await req.formData()).get('file')
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'חסר קובץ' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `הקובץ גדול מדי (עד ${MAX_FILE_BYTES / 1024 / 1024}MB)`, code: 'FILE_TOO_LARGE' },
      { status: 413 }
    )
  }

  try {
    const workbook = readRawGrid(await file.arrayBuffer(), file.name)
    return NextResponse.json({ fileName: file.name, ...truncateWorkbook(workbook, MAX_PREVIEW_ROWS) })
  } catch (e) {
    if (e instanceof RawGridError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 422 })
    }
    throw e
  }
}
