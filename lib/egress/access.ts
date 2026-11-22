import { NextResponse } from 'next/server'
import { isReadOnly } from '@/lib/read-only'
import { NOT_LOCAL, maySync } from '@/lib/sync/access'
import { EGRESS_MESSAGES } from './messages'

/** May this request see or change network isolation? Gated like the debug log; hidden in the read-only demo. */
export function mayUseEgress(headers: Headers): boolean {
  return !isReadOnly() && maySync(headers)
}

/** Every /api/egress route starts with this: the refusal to answer with, or null to go on */
export function egressRefusal(headers: Headers): NextResponse | null {
  if (isReadOnly()) return NextResponse.json({ error: EGRESS_MESSAGES.READ_ONLY, code: 'READ_ONLY' }, { status: 404 })
  if (!maySync(headers)) return NextResponse.json(NOT_LOCAL, { status: 403 })
  return null
}
