import { NextResponse } from 'next/server'
import { getUploadHistory } from '@/lib/db/upload'
import { logged } from '@/lib/log/route'

async function handleGET() {
  const history = await getUploadHistory()
  return NextResponse.json(history)
}

export const GET = logged(handleGET)
