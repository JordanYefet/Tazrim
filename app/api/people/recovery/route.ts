import { NextResponse } from 'next/server'
import { newRecoveryCode } from '@/lib/auth/household'

export const dynamic = 'force-dynamic'

/** POST: a new recovery code, shown once; the previous code stops working */
export async function POST() {
  return NextResponse.json({ recoveryCode: await newRecoveryCode() })
}
