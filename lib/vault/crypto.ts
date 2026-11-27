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
 * - A passkey's mailbox (ENG-140) is an X25519 key pair: its private half sealed under a key from the
 *   passkey's PRF output (its own HKDF label), its public half stored in the open. Anyone holding the vault
 *   key can seal it to the public half (ephemeral X25519 + HKDF + AES-256-GCM); only that passkey's PRF output
 *   opens it. See the mailbox section at the end.
 *
 * Sealed text: "v1.<iv>.<tag>.<ciphertext>", each part base64url.
 */
import { createCipheriv, createDecipheriv, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, scrypt as scryptCb, type KeyObject } from 'node:crypto'
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

// ── A passkey's mailbox (ENG-140) ────────────────────────────────────────

// DER prefixes of an X25519 key: the raw 32 bytes follow
const SPKI_PREFIX = Buffer.from('302a300506032b656e032100', 'hex')
const PKCS8_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex')

const rawPublic = (k: KeyObject) => (k.export({ format: 'der', type: 'spki' }) as Buffer).subarray(SPKI_PREFIX.length)
const rawPrivate = (k: KeyObject) => (k.export({ format: 'der', type: 'pkcs8' }) as Buffer).subarray(PKCS8_PREFIX.length)
const publicFromRaw = (raw: Buffer) => createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' })
const privateFromRaw = (raw: Buffer) => createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, raw]), format: 'der', type: 'pkcs8' })

/** Associated data tying a mailbox's sealed private key, and a copy sealed to it, to its passkey */
export const mailboxPrivateAad = (passkeyId: string) => `mailbox-private:${passkeyId}`
export const mailboxSealAad = (passkeyId: string) => `mailbox-seal:${passkeyId}`

/** The key that opens a mailbox's private half: HKDF of the passkey's PRF output, under its own label */
export function mailboxKeyFromPrf(prfOutput: Buffer, prfSalt: string): Buffer {
  if (prfOutput.length < 32) throw new Error('PRF output too short')
  return derive(prfOutput, prfSalt, 'tazrim vault: mailbox key v1')
}

export interface NewMailbox {
  /** Raw X25519 public key, base64url */
  publicKey: string
  /** The private key sealed under the PRF output */
  sealedPrivate: string
}

/** A fresh key pair for a passkey; the private half is sealed under its PRF output and never kept */
export function newMailbox(passkeyId: string, prfOutput: Buffer, prfSalt: string): NewMailbox {
  const { publicKey, privateKey } = generateKeyPairSync('x25519')
  const raw = Buffer.from(rawPrivate(privateKey))
  const key = mailboxKeyFromPrf(prfOutput, prfSalt)
  const sealedPrivate = seal(key, raw, mailboxPrivateAad(passkeyId))
  raw.fill(0)
  key.fill(0)
  return { publicKey: Buffer.from(rawPublic(publicKey)).toString('base64url'), sealedPrivate }
}

/** The mailbox's raw private key, or null when this PRF output (or passkey) is not the one it was sealed for */
export function openMailboxPrivate(passkeyId: string, sealedPrivate: string, prfOutput: Buffer, prfSalt: string): Buffer | null {
  const key = mailboxKeyFromPrf(prfOutput, prfSalt)
  const raw = open(key, sealedPrivate, mailboxPrivateAad(passkeyId))
  key.fill(0)
  return raw && raw.length === 32 ? raw : null
}

function sealKey(shared: Buffer, ephemeralPublic: Buffer, recipientPublic: Buffer): Buffer {
  const salt = Buffer.concat([ephemeralPublic, recipientPublic]).toString('base64url')
  return derive(shared, salt, 'tazrim vault: mailbox seal v1')
}

/** Seals `plaintext` (the vault key) to a mailbox's public key: "<ephemeral public key>.v1.<iv>.<tag>.<ciphertext>" */
export function sealToMailbox(publicKey: string, plaintext: Buffer, passkeyId: string): string {
  const recipient = Buffer.from(publicKey, 'base64url')
  const eph = generateKeyPairSync('x25519')
  const ephPublic = Buffer.from(rawPublic(eph.publicKey))
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: publicFromRaw(recipient) })
  const key = sealKey(shared, ephPublic, recipient)
  const sealed = seal(key, plaintext, mailboxSealAad(passkeyId))
  key.fill(0)
  shared.fill(0)
  return `${ephPublic.toString('base64url')}.${sealed}`
}

/** What was sealed to this mailbox, or null for another key, another passkey, or a changed byte */
export function openFromMailbox(privateRaw: Buffer, sealed: string, passkeyId: string): Buffer | null {
  const dot = sealed.indexOf('.')
  if (dot < 1) return null
  try {
    const ephPublic = Buffer.from(sealed.slice(0, dot), 'base64url')
    if (ephPublic.length !== 32) return null
    const priv = privateFromRaw(privateRaw)
    const recipient = Buffer.from(rawPublic(createPublicKey(priv)))
    const shared = diffieHellman({ privateKey: priv, publicKey: publicFromRaw(ephPublic) })
    const key = sealKey(shared, ephPublic, recipient)
    const plain = open(key, sealed.slice(dot + 1), mailboxSealAad(passkeyId))
    key.fill(0)
    shared.fill(0)
    return plain
  } catch {
    return null
  }
}
