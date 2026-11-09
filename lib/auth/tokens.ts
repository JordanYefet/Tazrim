import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** A random, URL-safe secret: session cookies and invite links. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** What the database keeps instead of a token: a leaked row can't be replayed as a cookie or link. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Crockford base32 without look-alikes (no I, L, O, U) */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Groups of four characters from ALPHABET, e.g. 4 groups = 80 bits. */
export function readableCode(groups: number): string {
  const bytes = randomBytes(groups * 4)
  const chars = Array.from(bytes, b => ALPHABET[b & 31])
  const out: string[] = []
  for (let i = 0; i < groups; i++) out.push(chars.slice(i * 4, i * 4 + 4).join(''))
  return out.join('-')
}

/** As typed: case, spaces and dashes don't matter, and the look-alikes read as their digits. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/** Constant-time comparison of two hex digests */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}
