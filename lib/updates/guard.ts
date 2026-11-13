import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { READ_ONLY_MESSAGE, isReadOnly } from '@/lib/read-only'
import { readToken } from './helper'

/** The demo never updates: every /api/updates route answers 403 there */
export function readOnlyRefusal(): NextResponse | null {
  return isReadOnly() ? NextResponse.json({ error: READ_ONLY_MESSAGE, readOnly: true }, { status: 403 }) : null
}

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest()

/** Does the request carry the helper's token? Compared in constant time. */
export function hasHelperToken(req: Request): boolean {
  const token = readToken()
  const m = /^Bearer (\S+)$/.exec(req.headers.get('authorization') ?? '')
  return !!token && !!m && crypto.timingSafeEqual(sha256(m[1]), sha256(token))
}
