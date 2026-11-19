import { NextResponse } from 'next/server'
import { checkNow } from '@/lib/updates/check'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { getUpdateView } from '@/lib/updates/state'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: ask GitHub now, answer with the refreshed state */
async function handlePOST() {
  const refused = readOnlyRefusal()
  if (refused) return refused
  await checkNow()
  return NextResponse.json(await getUpdateView())
}

export const POST = logged(handlePOST)
