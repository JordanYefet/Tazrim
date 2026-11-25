/**
 * The sign-in passkeys of a person, in the shape the updater adopts them (ENG-139): credential id,
 * the public key as SPKI DER (base64url) and the COSE algorithm. The Passkey rows keep the COSE
 * key @simplewebauthn wrote; the updater has no dependencies and reads SPKI with node:crypto.
 */
import { createPublicKey } from 'node:crypto'
import { decodeCredentialPublicKey, cose } from '@simplewebauthn/server/helpers'
import { prisma } from '@/lib/db/client'

export interface SigninKey {
  id: string
  publicKey: string
  alg: -7 | -8 | -257
}

const b64u = (b: Uint8Array) => Buffer.from(b).toString('base64url')

/** A COSE key (EC2 P-256, OKP Ed25519 or RSA) as { SPKI DER b64url, alg }; null for anything else or a broken key */
export function coseToSpki(bytes: Uint8Array<ArrayBuffer>): { publicKey: string; alg: SigninKey['alg'] } | null {
  try {
    const key = decodeCredentialPublicKey(bytes)
    let jwk: Record<string, string>
    let alg: SigninKey['alg']
    if (cose.isCOSEPublicKeyEC2(key)) {
      const x = key.get(cose.COSEKEYS.x)
      const y = key.get(cose.COSEKEYS.y)
      if (key.get(cose.COSEKEYS.crv) !== cose.COSECRV.P256 || !x || !y) return null
      jwk = { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) }
      alg = -7
    } else if (cose.isCOSEPublicKeyOKP(key)) {
      const x = key.get(cose.COSEKEYS.x)
      if (key.get(cose.COSEKEYS.crv) !== cose.COSECRV.ED25519 || !x) return null
      jwk = { kty: 'OKP', crv: 'Ed25519', x: b64u(x) }
      alg = -8
    } else if (cose.isCOSEPublicKeyRSA(key)) {
      const n = key.get(cose.COSEKEYS.n)
      const e = key.get(cose.COSEKEYS.e)
      if (!n || !e) return null
      jwk = { kty: 'RSA', n: b64u(n), e: b64u(e) }
      alg = -257
    } else return null
    const spki = createPublicKey({ key: jwk, format: 'jwk' }).export({ format: 'der', type: 'spki' })
    return { publicKey: b64u(spki), alg }
  } catch {
    return null
  }
}

/** The person's passkeys that convert, oldest first; those that don't are left out */
export async function signinKeysFor(personId: string): Promise<(SigninKey & { label: string })[]> {
  const rows = await prisma.passkey.findMany({ where: { personId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { credentialId: true, publicKey: true, label: true } })
  return rows.flatMap(r => {
    const k = coseToSpki(r.publicKey)
    return k ? [{ id: r.credentialId, label: r.label, ...k }] : []
  })
}
