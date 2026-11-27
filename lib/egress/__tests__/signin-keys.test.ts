import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { coseToSpki } from '../signin-keys'

// Fake keys, generated per run. CBOR written by hand: a map of small integers to byte strings.
const cborInt = (n: number) => (n >= 0 ? Buffer.from([n]) : Buffer.from([0x20 + (-1 - n)]))
const cborBytes = (b: Buffer) => Buffer.concat([b.length < 24 ? Buffer.from([0x40 + b.length]) : b.length < 256 ? Buffer.from([0x58, b.length]) : Buffer.from([0x59, b.length >> 8, b.length & 255]), b])
const cborMap = (pairs: [number, number | Buffer][]) => Buffer.concat([Buffer.from([0xa0 + pairs.length]), ...pairs.flatMap(([k, v]) => [cborInt(k), typeof v === 'number' ? cborInt(v) : cborBytes(v)])])
const b64u = (s: string) => Buffer.from(s, 'base64url')

describe('coseToSpki', () => {
  it('converts an EC2 P-256 key (ES256)', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const jwk = publicKey.export({ format: 'jwk' })
    const cose = cborMap([[1, 2], [3, -7], [-1, 1], [-2, b64u(jwk.x!)], [-3, b64u(jwk.y!)]])
    expect(coseToSpki(cose)).toEqual({ publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), alg: -7 })
  })

  it('converts an OKP Ed25519 key (EdDSA)', () => {
    const { publicKey } = generateKeyPairSync('ed25519')
    const jwk = publicKey.export({ format: 'jwk' })
    const cose = cborMap([[1, 1], [3, -8], [-1, 6], [-2, b64u(jwk.x!)]])
    expect(coseToSpki(cose)).toEqual({ publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), alg: -8 })
  })

  it('converts an RSA key (RS256)', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const jwk = publicKey.export({ format: 'jwk' })
    const cose = cborMap([[1, 3], [3, -257], [-1, b64u(jwk.n!)], [-2, b64u(jwk.e!)]])
    expect(coseToSpki(cose)).toEqual({ publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64url'), alg: -257 })
  })

  it('leaves out other curves, broken keys and nonsense', () => {
    const { publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const jwk = publicKey.export({ format: 'jwk' })
    expect(coseToSpki(cborMap([[1, 2], [3, -35], [-1, 2], [-2, b64u(jwk.x!)], [-3, b64u(jwk.y!)]]))).toBeNull()
    expect(coseToSpki(cborMap([[1, 2], [3, -7], [-1, 1], [-2, Buffer.alloc(32)], [-3, Buffer.alloc(32)]]))).toBeNull()
    expect(coseToSpki(Buffer.from([1, 2, 3]))).toBeNull()
    expect(coseToSpki(new Uint8Array())).toBeNull()
  })
})
