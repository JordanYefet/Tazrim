import { NextResponse, type NextRequest } from 'next/server'
import { READ_ONLY_MESSAGE, isReadOnly, isWriteBlocked } from '@/lib/read-only'

/** Read-only mode (lib/read-only.ts): every write to the API is refused here, before any route runs. */
export function middleware(req: NextRequest) {
  if (isReadOnly() && isWriteBlocked(req.method, req.nextUrl.pathname)) {
    return NextResponse.json({ error: READ_ONLY_MESSAGE, readOnly: true }, { status: 403 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/:path*',
  // Node, so TAZRIM_READ_ONLY is read when the server runs, not when it is built
  runtime: 'nodejs',
}
