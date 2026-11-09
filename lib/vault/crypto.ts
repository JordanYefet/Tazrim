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
 * Sealed text: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
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
