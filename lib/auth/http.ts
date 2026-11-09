import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE } from './config'
import { clientKey, rateLimit } from './rate-limit'
import { readSession, sessionCookie } from './session'
import { relyingParty, type RelyingParty } from './webauthn'
import { isLoopbackHost } from '@/lib/local-request'

export const fail = (status: number, error: string, code: string) => NextResponse.json({ error, code }, { status })

/** The relying party for this request, or an error response (a host outside TAZRIM_ORIGINS, or no host) */
export function rpOr400(req: Request): RelyingParty | NextResponse {
  return relyingParty(req.headers) ?? fail(400, 'הכתובת הזאת לא מורשית לכניסה', 'BAD_ORIGIN')
}

/** False once this client went over `limit` calls of `bucket` in `windowMs` */
export function allow(req: Request, bucket: string, limit: number, windowMs = 10 * 60 * 1000): boolean {
  return rateLimit(`${bucket}:${clientKey(req.headers)}`, limit, windowMs)
}

/** TAZRIM_REQUIRE_HTTPS=1: passwords only over https (or on this computer itself) */
export function httpsRequired(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.TAZRIM_REQUIRE_HTTPS ?? '')
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
  if (rp.secure || isLoopbackHost(host.split(',')[0])) return null
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
