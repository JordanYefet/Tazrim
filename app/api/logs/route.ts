import { NextResponse } from 'next/server'
import { logsRefusal } from '@/lib/log/access'
import { appendAction, clear, entriesAfter, stats } from '@/lib/log/buffer'

export const dynamic = 'force-dynamic'

/**
 * The debug log (ENG-104). Every route here is gated like the bank sync: this machine,
 * or a signed-in household member with the login on; never in read-only mode.
 *
 * GET ?after=<id>: the entries after that id (all kept ones without it), with the totals
 * and the epoch (when the count began): a reader whose epoch differs starts over.
 */
export async function GET(req: Request) {
  const refused = logsRefusal(req.headers)
  if (refused) return refused
  const after = Number(new URL(req.url).searchParams.get('after'))
  return NextResponse.json({ entries: entriesAfter(Number.isFinite(after) && after > 0 ? after : 0), ...stats() })
}

/** POST { label }: the person went somewhere or pressed something: the start of a group */
export async function POST(req: Request) {
  const refused = logsRefusal(req.headers)
  if (refused) return refused
  const body = (await req.json().catch(() => null)) as { label?: unknown } | null
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  if (!label) return NextResponse.json({ error: 'חסר שם לפעולה', code: 'INVALID' }, { status: 400 })
  return NextResponse.json({ entry: appendAction(label) })
}

/** DELETE: empties the buffer */
export async function DELETE(req: Request) {
  const refused = logsRefusal(req.headers)
  if (refused) return refused
  clear()
  return NextResponse.json({ ok: true, ...stats() })
}
