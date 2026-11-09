/**
 * Optional passwords (ENG-89): a second way in for a device that has no
 * passkey, such as a Mac when the passkey was made on the phone.
 *
 * Stored as scrypt (node:crypto, memory-hard): `scrypt$N$r$p$salt$hash`, salt
 * and hash in base64. The parameters live in the string, so they can be raised
 * later without breaking existing passwords.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto'

import { PASSWORD_MAX, PASSWORD_MIN } from './password-rules'

export { PASSWORD_MAX, PASSWORD_MIN }

const N = 32768
const R = 8
const P = 1
const KEY_LEN = 32

function scrypt(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    // 128 * N * r bytes of memory, plus room: Node's default cap (32 MiB) is exactly too small for N = 32768
    scryptCb(password.normalize('NFC'), salt, KEY_LEN, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key)
    )
  )
}

/** Why a new password can't be used, in the user's words, or null when it can */
export function passwordProblem(value: unknown): string | null {
  if (typeof value !== 'string') return 'חסרה סיסמה'
  if ([...value].length < PASSWORD_MIN) return `סיסמה צריכה לפחות ${PASSWORD_MIN} תווים`
  if ([...value].length > PASSWORD_MAX) return `סיסמה ארוכה מדי (עד ${PASSWORD_MAX} תווים)`
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, { N, r: R, p: P })
  return ['scrypt', N, R, P, salt.toString('base64'), key.toString('base64')].join('$')
}

/** Does `password` match `stored`? A malformed stored value never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64')
  try {
    const key = await scrypt(password, Buffer.from(salt, 'base64'), { N: Number(n), r: Number(r), p: Number(p) })
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

/** A hash no password matches, checked when the name is unknown, so a wrong name takes as long as a wrong password */
let dummy: Promise<string> | null = null
export async function burnPasswordCheck(password: string) {
  dummy ??= hashPassword(randomBytes(16).toString('hex'))
  await verifyPassword(password, await dummy)
}
