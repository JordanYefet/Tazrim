import { isAuthRequired } from '@/lib/auth/config'
import { isLocalRequest } from '@/lib/local-request'

/** Where a sync can't run: with the login off, only on the machine the app runs on. */
export const NOT_LOCAL = { error: 'בלי כניסה עם מפתח, אפשר לסנכרן רק מהמחשב שעליו האפליקציה רצה', code: 'NOT_LOCAL' }

/**
 * May this request start or answer a sync (a bank password typed into it)?
 * With the login on (ENG-89) the middleware already let only a signed-in
 * household member through, so any of their devices may; with it off, only
 * this machine, as before. Deleting all data stays this-machine only.
 */
export function maySync(headers: Headers): boolean {
  return isAuthRequired() || isLocalRequest(headers)
}
