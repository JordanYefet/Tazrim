import { NextResponse } from 'next/server'
import { getUploadHistory } from '@/lib/db/upload'

export async function GET() {
  const history = await getUploadHistory()
  return NextResponse.json(history)
}
