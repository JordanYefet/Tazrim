import { NextResponse } from 'next/server'
import { logsRefusal } from '@/lib/log/access'
import { clear, entriesAfter, stats } from '@/lib/log/buffer'

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

/** DELETE: empties the buffer */
export async function DELETE(req: Request) {
  const refused = logsRefusal(req.headers)
  if (refused) return refused
  clear()
  return NextResponse.json({ ok: true, ...stats() })
}
