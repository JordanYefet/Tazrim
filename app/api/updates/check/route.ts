import { NextResponse } from 'next/server'
import { checkNow } from '@/lib/updates/check'
import { readOnlyRefusal } from '@/lib/updates/guard'
import { getUpdateView } from '@/lib/updates/state'

export const dynamic = 'force-dynamic'

/** POST: ask GitHub now, answer with the refreshed state */
export async function POST() {
  const refused = readOnlyRefusal()
  if (refused) return refused
  await checkNow()
  return NextResponse.json(await getUpdateView())
}
