import { NextRequest, NextResponse } from 'next/server'
import { dismissUnusual, undismissUnusual, type TransactionSource } from '@/lib/db/unusual'
import { logged } from '@/lib/log/route'

async function readKey(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  return {
    source: body.source as TransactionSource,
    transactionId: body.transactionId as string,
    reason: typeof body.reason === 'string' ? body.reason : undefined,
  }
}

/** POST { source: 'bank' | 'card', transactionId, reason? } — mark as "not unusual" */
async function handlePOST(req: NextRequest) {
  try {
    const dismissal = await dismissUnusual(await readKey(req))
    return NextResponse.json(dismissal)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

/** DELETE { source, transactionId } — undo */
async function handleDELETE(req: NextRequest) {
  try {
    const { source, transactionId } = await readKey(req)
    return NextResponse.json(await undismissUnusual({ source, transactionId }))
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}

export const POST = logged(handlePOST)
export const DELETE = logged(handleDELETE)
