import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/** Liveness for the Docker healthcheck: 200 when the server answers and the database opens. */
async function handleGET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}

export const GET = logged(handleGET)
