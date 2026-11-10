import { NextResponse } from 'next/server'
import { currentQueue } from '@/lib/sync/runs'

export const dynamic = 'force-dynamic'

/**
 * GET: "sync all" as it stands, polled by the sync sheet while it goes: every
 * company's row with its run (the step, or the code or links it waits for).
 * Lighter than GET /api/sync, which also reads every company's last sync.
 */
export async function GET() {
  return NextResponse.json({ queue: currentQueue() })
}
