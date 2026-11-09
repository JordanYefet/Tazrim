import { describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { keyFromPrf, keyFromRecovery, newRecoveryKey, newSalt, newVaultKey, open, seal, wrapAad } from '../crypto'

describe('seal / open (AES-256-GCM)', () => {
  const key = newVaultKey()
  const plain = Buffer.from('{"username":"fake-user","password":"fake-pass-123"}')

  it('round-trips, with a fresh IV every time', () => {
    const a = seal(key, plain, 'credential:1')
    const b = seal(key, plain, 'credential:1')
    expect(a).not.toBe(b)
    expect(open(key, a, 'credential:1')?.equals(plain)).toBe(true)
    expect(a).not.toContain('fake-pass')
  })

  it('refuses a wrong key, another row, or any changed byte', () => {
    const sealed = seal(key, plain, 'credential:1')
    expect(open(newVaultKey(), sealed, 'credential:1')).toBeNull()
    expect(open(key, sealed, 'credential:2')).toBeNull()
    const [v, iv, tag, ct] = sealed.split('.')
    const flipped = Buffer.from(ct, 'base64url')
    flipped[0] ^= 1
    expect(open(key, [v, iv, tag, flipped.toString('base64url')].join('.'), 'credential:1')).toBeNull()
    expect(open(key, 'v2.' + sealed.slice(3), 'credential:1')).toBeNull()
    expect(open(key, 'garbage', 'credential:1')).toBeNull()
  })
})

describe('keys from a passkey and from the recovery key', () => {
  it('the same PRF output and salt give the same key; another salt or output does not', () => {
    const prf = randomBytes(32)
    const salt = newSalt()
    expect(keyFromPrf(prf, salt).equals(keyFromPrf(Buffer.from(prf), salt))).toBe(true)
    expect(keyFromPrf(prf, newSalt()).equals(keyFromPrf(prf, salt))).toBe(false)
    expect(keyFromPrf(randomBytes(32), salt).equals(keyFromPrf(prf, salt))).toBe(false)
    expect(() => keyFromPrf(randomBytes(16), salt)).toThrow()
  })

  it('wraps the vault key so only the right PRF output opens it', () => {
    const vaultKey = newVaultKey()
    const prf = randomBytes(32)
    const salt = newSalt()
    const wrapped = seal(keyFromPrf(prf, salt), vaultKey, wrapAad('pk1'))
    expect(open(keyFromPrf(prf, salt), wrapped, wrapAad('pk1'))?.equals(vaultKey)).toBe(true)
    expect(open(keyFromPrf(randomBytes(32), salt), wrapped, wrapAad('pk1'))).toBeNull()
    // Another passkey's row can't take this copy
    expect(open(keyFromPrf(prf, salt), wrapped, wrapAad('pk2'))).toBeNull()
  })

  it('a recovery key is long, and typed in any case with any dashes it gives the same key', () => {
    const r = newRecoveryKey()
    expect(r).toMatch(/^([0-9A-Z]{4}-){12}[0-9A-Z]{4}$/)
    expect(keyFromRecovery(r.toLowerCase().replaceAll('-', ' ')).equals(keyFromRecovery(r))).toBe(true)
    expect(keyFromRecovery(newRecoveryKey()).equals(keyFromRecovery(r))).toBe(false)
  })
})
