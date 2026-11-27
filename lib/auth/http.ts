import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, isAuthRequired } from './config'
import { clientKey, rateLimit } from './rate-limit'
import { readSession, sessionCookie, type SignedIn } from './session'
import { relyingParty, type RelyingParty } from './webauthn'
import { getRequireHttps } from '@/lib/settings/app-settings'
import { isLoopbackHost, isThisComputer } from '@/lib/local-request'

export const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status })

/** The relying party for this request, or an error response (a host outside TAZRIM_ORIGINS, or no host) */
export function rpOr400(req: Request): RelyingParty | NextResponse {
  return relyingParty(req.headers) ?? fail(400, 'הכתובת הזאת לא מורשית לכניסה', 'BAD_ORIGIN')
}

/** False once this client went over `limit` calls of `bucket` in `windowMs` */
export function allow(req: Request, bucket: string, limit: number, windowMs = 10 * 60 * 1000): boolean {
  return rateLimit(`${bucket}:${clientKey(req.headers)}`, limit, windowMs)
}

/** Settings (or TAZRIM_REQUIRE_HTTPS=1): passwords only over https (or on this computer itself) */
export function httpsRequired(): boolean {
  return getRequireHttps()
}

/**
 * Passwords work over plain http from the home network by default, so a new
 * install works from a phone with nothing to set up (passkeys need https, so
 * they can't). The password and cookie then cross the Wi-Fi unencrypted:
 * TAZRIM_REQUIRE_HTTPS=1 refuses that, keeping https and localhost only.
 */
export function passwordTransportOr400(req: Request, rp: RelyingParty): NextResponse | null {
  if (!httpsRequired()) return null
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
  if (rp.secure || isThisComputer(req.headers) || isLoopbackHost(host.split(',')[0])) return null
  return fail(400, 'סיסמה עובדת רק בחיבור מאובטח (https), או ב-localhost על המחשב עצמו', 'INSECURE')
}

export const TOO_MANY = () => fail(429, 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות', 'RATE_LIMITED')

/** A JSON response that also signs this browser in */
export function signedIn(body: object, token: string, rp: RelyingParty) {
  const res = NextResponse.json(body)
  res.cookies.set(sessionCookie(token, rp.secure))
  return res
}

/** The signed-in person in a route handler or server component, or null */
export async function currentSession() {
  const jar = await cookies()
  return readSession(jar.get(SESSION_COOKIE)?.value)
}

export const ADMIN_ONLY = () => fail(403, 'רק מנהל/ת יכול/ה לעשות את זה', 'ADMIN_ONLY')

/**
 * Permission levels (ENG-140): null when this session may do an admin-only thing, else the
 * response to answer with (401 signed out, 403 ADMIN_ONLY). With the login off (development
 * on demo data) nobody is signed in and everything is allowed, as before. A session opened
 * with the recovery code belongs to the owner, so it is an admin's.
 */
export function adminOr403(session: SignedIn | null): NextResponse | null {
  if (!isAuthRequired()) return null
  if (!session) return fail(401, 'צריך להתחבר מחדש', 'SIGNED_OUT')
  return session.role === 'admin' ? null : ADMIN_ONLY()
}

/** The same, reading the session from the request's cookie: the first line of an admin-only route */
export async function adminRefusal(): Promise<NextResponse | null> {
  return adminOr403(isAuthRequired() ? await currentSession() : null)
}

/** Pages: may the viewer change admin-only settings? Everyone may with the login off (development on demo data). */
export async function viewerIsAdmin(): Promise<boolean> {
  return adminOr403(isAuthRequired() ? await currentSession() : null) === null
}
