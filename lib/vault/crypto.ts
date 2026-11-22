/**
 * The vault's crypto (ENG-90), with node:crypto only.
 *
 * - The vault key is 32 random bytes. Everything in the vault is AES-256-GCM
 *   under it, with a fresh 12-byte IV per value and the row's id as associated
 *   data, so a sealed value can't be moved to another row.
 * - A passkey's copy of the vault key is AES-256-GCM under a key derived with
 *   HKDF-SHA256 from that passkey's 32-byte WebAuthn PRF output. The recovery
 *   key's copy is the same, derived from the recovery key.
 *
 * - A person's password copy (ENG-135) is the same, under a key from their password
 *   with scrypt (N=2^17, r=8, p=1, 128 MiB, a random salt of its own), the parameters
 *   stored with the copy so they can be raised later. A password is guessable, unlike
 *   a PRF output, so this key is deliberately slow to compute.
 *
 * Sealed text: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scrypt as scryptCb } from 'node:crypto'
import { normalizeCode, readableCode } from '@/lib/auth/tokens'

const VERSION = 'v1'
const KEY_BYTES = 32

export const newVaultKey = () => randomBytes(KEY_BYTES)
export const newSalt = () => randomBytes(32).toString('base64url')

export function seal(key: Buffer, plaintext: Buffer, aad: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(aad, 'utf8'))
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

/** The plaintext, or null for a wrong key, other associated data, or a changed byte */
export function open(key: Buffer, sealed: string, aad: string): Buffer | null {
  const [version, iv, tag, ct] = sealed.split('.')
  if (version !== VERSION || !iv || !tag || ct === undefined) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(aad, 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()])
  } catch {
    return null
  }
}

function derive(secret: Buffer, salt: string, info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.from(salt, 'utf8'), info, KEY_BYTES))
}

/** The key that opens a passkey's copy: HKDF of its PRF output (never stored) */
export function keyFromPrf(prfOutput: Buffer, prfSalt: string): Buffer {
  if (prfOutput.length < 32) throw new Error('PRF output too short')
  return derive(prfOutput, prfSalt, 'tazrim vault: passkey wrap v1')
}

/** A recovery key to show once: 13 groups of four, 260 bits */
export const newRecoveryKey = () => readableCode(13)

/** The key that opens the recovery copy; case, spaces and dashes don't matter */
export function keyFromRecovery(recoveryKey: string): Buffer {
  return derive(Buffer.from(normalizeCode(recoveryKey), 'utf8'), 'tazrim vault recovery', 'tazrim vault: recovery wrap v1')
}

/** Associated data that ties a copy of the vault key to its row's purpose */
export const wrapAad = (passkeyId: string | null) => (passkeyId ? `wrap:${passkeyId}` : 'wrap:recovery')

/** The same for a person's password copy */
export const passwordWrapAad = (personId: string) => `wrap:password:${personId}`

/** scrypt parameters for a password copy (OWASP-grade; about 0.3 s and 128 MiB per try) */
export const PASSWORD_KDF = { N: 2 ** 17, r: 8, p: 1 } as const

/** "scrypt$N$r$p$<salt>": what a password copy stores to derive its key again */
export function newPasswordKdf(): string {
  return ['scrypt', PASSWORD_KDF.N, PASSWORD_KDF.r, PASSWORD_KDF.p, randomBytes(16).toString('base64url')].join('$')
}

/** The key that opens a person's password copy; null for a malformed or unsupported `kdf` */
export function keyFromPassword(password: string, kdf: string): Promise<Buffer | null> {
  const [kind, n, r, p, salt] = kdf.split('$')
  const [N, R, P] = [Number(n), Number(r), Number(p)]
  if (kind !== 'scrypt' || !salt || !(N >= 2 ** 14 && N <= 2 ** 20) || !(R >= 1 && R <= 16) || !(P >= 1 && P <= 4)) return Promise.resolve(null)
  return new Promise(resolve =>
    scryptCb(password.normalize('NFC'), Buffer.from(salt, 'base64url'), KEY_BYTES, { N, r: R, p: P, maxmem: 128 * N * R + 8 * 1024 * 1024 }, (err, key) =>
      resolve(err ? null : key)
    )
  )
}
