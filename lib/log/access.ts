import { NextResponse } from 'next/server'
import { isReadOnly } from '@/lib/read-only'
import { NOT_LOCAL, maySync } from '@/lib/sync/access'

/** The debug log is not in the read-only demo, where nothing runs that could be debugged */
export const LOGS_READ_ONLY = { error: 'הלוגים לא זמינים בדמו לקריאה בלבד', code: 'READ_ONLY' }

/** May this request see or change the log? The same rule as the bank sync, and never in read-only mode. */
export function mayUseLogs(headers: Headers): boolean {
  return !isReadOnly() && maySync(headers)
}

/** Every /api/logs route starts with this: the refusal to answer with, or null to go on */
export function logsRefusal(headers: Headers): NextResponse | null {
  if (isReadOnly()) return NextResponse.json(LOGS_READ_ONLY, { status: 403 })
  if (!maySync(headers)) return NextResponse.json(NOT_LOCAL, { status: 403 })
  return null
}
