import { NextResponse, type NextRequest } from 'next/server'
import { READ_ONLY_MESSAGE, isReadOnly, isWriteBlocked } from '@/lib/read-only'
import { BARE_HEADER, SESSION_COOKIE, isAuthRequired, isBarePath, isPublicPath } from '@/lib/auth/config'
import { readSession } from '@/lib/auth/session'

/**
 * Two gates, before any page or route runs:
 *   - read-only mode (lib/read-only.ts): every write to the API is refused;
 *   - login (ENG-89, lib/auth): with no valid session, pages redirect to
 *     /login and API calls answer 401. A revoked device's session is gone
 *     from the database, so its next request lands here.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (isReadOnly() && isWriteBlocked(req.method, pathname)) {
    return NextResponse.json({ error: READ_ONLY_MESSAGE, readOnly: true }, { status: 403 })
  }

  // The sign-in pages render without the app's sidebar and header (app/layout.tsx)
  const bare = isBarePath(pathname.replace(/\/+$/, '') || '/')
  const next = () => {
    if (!bare) return NextResponse.next()
    const headers = new Headers(req.headers)
    headers.set(BARE_HEADER, '1')
    return NextResponse.next({ request: { headers } })
  }

  if (!isAuthRequired() || isPublicPath(pathname)) return next()

  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null)
  if (session) return next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'צריך להתחבר', code: 'SIGNED_OUT' }, { status: 401 })
  }
  const login = req.nextUrl.clone()
  login.pathname = '/login'
  login.search = ''
  const back = pathname + req.nextUrl.search
  if (back !== '/') login.searchParams.set('next', back)
  const res = NextResponse.redirect(login)
  // A stale cookie (revoked, idle) is dropped so the browser stops sending it
  if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE)
  return res
}

export const config = {
  // Everything but Next's static files; lib/auth/config.ts decides what stays public
  matcher: '/((?!_next/static|_next/image).*)',
  // Node, so TAZRIM_READ_ONLY and TAZRIM_AUTH are read when the server runs, and Prisma checks the session
  runtime: 'nodejs',
}
