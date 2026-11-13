/**
 * Login (ENG-89): who must sign in, and the session cookie.
 *
 * Every page and API call needs a signed-in household member, except the
 * read-only demo (lib/read-only.ts), and development on demo data when
 * TAZRIM_AUTH=off (npm run dev:demo sets it). Sign-in is by passkey only.
 */
import { isReadOnly } from '@/lib/read-only'

export const SESSION_COOKIE = 'tazrim_session'

/** A session ends when the browser closes (no Max-Age); the server also drops one idle this long. */
export const SESSION_IDLE_MS = 12 * 60 * 60 * 1000

/** lastSeenAt is written at most this often, so reads don't turn into writes */
export const SESSION_TOUCH_MS = 5 * 60 * 1000

/** An invite link (a new person or another device) works this long, once. */
export const INVITE_TTL_MS = 15 * 60 * 1000

/** A WebAuthn challenge works this long, once. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

export function isAuthOff(): boolean {
  const v = process.env.TAZRIM_AUTH?.toLowerCase()
  return v === 'off' || v === '0' || v === 'false'
}

/** Does this server ask for a login at all? */
export function isAuthRequired(): boolean {
  return !isReadOnly() && !isAuthOff()
}

/** Pages shown without the app's sidebar and header (the request carries BARE_HEADER) */
export const BARE_HEADER = 'x-tazrim-bare'

/** Reachable with no session. Everything else redirects to /login (pages) or answers 401 (API). */
export function isPublicPath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (isAuthPage(path)) return true
  if (path === '/api/health' || path.startsWith('/api/auth/')) return true
  // The updater helper calls this with its own token, which the route checks (ENG-98)
  if (path === '/api/updates/backup') return true
  // What the browser and the home screen fetch before anyone signs in
  return (
    path.startsWith('/_next/') ||
    path === '/manifest.webmanifest' ||
    path === '/favicon.ico' ||
    path === '/icon' ||
    path === '/apple-icon' ||
    path.startsWith('/pwa-icons/') ||
    path.startsWith('/background-tile') ||
    path === '/sw.js'
  )
}

/** The sign-in, first-run and invite pages */
function isAuthPage(path: string): boolean {
  return path === '/login' || path === '/setup' || path === '/invite' || path.startsWith('/invite/')
}

/** Pages without the app's sidebar and header: the sign-in pages, and an update's progress (ENG-98), which still needs a session */
export function isBarePath(path: string): boolean {
  return isAuthPage(path) || path === '/updating'
}
