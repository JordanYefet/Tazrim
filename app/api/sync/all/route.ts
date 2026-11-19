import { NextResponse } from 'next/server'
import { currentQueue } from '@/lib/sync/runs'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * GET: "sync all" as it stands, polled by the sync sheet while it goes: every
 * company's row with its run (the step, or the code or links it waits for).
 * Lighter than GET /api/sync, which also reads every company's last sync.
 */
async function handleGET() {
  return NextResponse.json({ queue: currentQueue() })
}

export const GET = logged(handleGET)
