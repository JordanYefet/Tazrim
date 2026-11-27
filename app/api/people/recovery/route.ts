import { NextResponse } from 'next/server'
import { adminRefusal } from '@/lib/auth/http'
import { newRecoveryCode } from '@/lib/auth/household'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** POST: a new recovery code, shown once; the previous code stops working */
async function handlePOST() {
  const notAdmin = await adminRefusal()
  if (notAdmin) return notAdmin
  return NextResponse.json({ recoveryCode: await newRecoveryCode() })
}

export const POST = logged(handlePOST)
