import { NextResponse } from 'next/server'
import { readUploadForm } from '@/lib/upload/form'
import { reimportUpload } from '@/lib/upload/import'

/**
 * Re-imports `file` into `accountId` with a corrected mapping (ENG-65): the
 * rows the account got from a file of the same name are replaced, in one
 * transaction. Same form as /api/upload (`mapping` or `profileId`, `force`),
 * plus `dryRun=1` to only count: { existing, incoming }.
 */
export async function POST(req: Request) {
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1'
  const input = await readUploadForm(req)
  if ('response' in input) return input.response
  const { file, account, force, mapping, profileId } = input

  if (account.archived) {
    return NextResponse.json({ error: 'החשבון בארכיון', code: 'ACCOUNT_ARCHIVED' }, { status: 409 })
  }

  try {
    const result = await reimportUpload(account, Buffer.from(await file.arrayBuffer()), file.name, {
      force,
      mapping,
      profileId,
      dryRun,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
    }
    const { ok: _ok, ...body } = result
    return NextResponse.json(body)
  } catch {
    return NextResponse.json({ error: 'הייבוא מחדש נכשל, לא שונה דבר', code: 'REIMPORT_FAILED' }, { status: 500 })
  }
}
