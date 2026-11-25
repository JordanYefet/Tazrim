/**
 * WebAuthn checks for the network-isolation approvals (ENG-133), by hand with Node's crypto: the
 * updater has no dependencies. Only what these two ceremonies need, with attestation "none":
 * registration (a public key to remember) and assertion (a signature over a challenge that
 * names this very change). Every function returns `{ ok: true, ... }` or `{ ok: false, code }`.
 */
import crypto from 'node:crypto'

/** COSE algorithms accepted, and the key type each one must come with */
export const ALGS = Object.freeze({ '-7': 'ec', '-257': 'rsa', '-8': 'ed25519' })

export const b64u = buf => Buffer.from(buf).toString('base64url')
export const fromB64u = s => Buffer.from(String(s ?? ''), 'base64url')
export const sha256 = data => crypto.createHash('sha256').update(data).digest()

const FLAG_UP = 0x01
const FLAG_UV = 0x04

const fail = code => ({ ok: false, code })

/** Accepts the whole @simplewebauthn/browser output ({ id, response: {...} }) or only its inner part */
function split(resp) {
  if (!resp || typeof resp !== 'object') return null
  const inner = resp.response && typeof resp.response === 'object' ? resp.response : resp
  return { id: typeof resp.id === 'string' ? resp.id : null, inner }
}

function clientDataOf(inner, type) {
  let raw
  let data
  try {
    raw = fromB64u(inner.clientDataJSON)
    data = JSON.parse(raw.toString('utf8'))
  } catch {
    return fail('BAD_CLIENT_DATA')
  }
  if (!data || typeof data !== 'object' || data.type !== type) return fail('BAD_CLIENT_DATA')
  return { ok: true, raw, data }
}

/** The origin's host must be the rpId or a subdomain of it */
function originOk(origin, rpId) {
  try {
    const host = new URL(origin).hostname
    return host === rpId || host.endsWith(`.${rpId}`)
  } catch {
    return false
  }
}

function authDataOf(inner, rpId) {
  const ad = fromB64u(inner.authenticatorData)
  if (ad.length < 37) return fail('BAD_AUTH_DATA')
  if (!ad.subarray(0, 32).equals(sha256(rpId))) return fail('BAD_RPID_HASH')
  const flags = ad[32]
  if (!(flags & FLAG_UP)) return fail('NO_USER_PRESENCE')
  if (!(flags & FLAG_UV)) return fail('NO_USER_VERIFICATION')
  return { ok: true, bytes: ad }
}

/**
 * A registration response against what was asked: `{ challenge, rpId }`.
 * -> { ok, id, publicKey (SPKI DER b64url), alg, origin }
 */
export function verifyRegistration(resp, { challenge, rpId }) {
  const parts = split(resp)
  if (!parts?.id) return fail('BAD_RESPONSE')
  const cd = clientDataOf(parts.inner, 'webauthn.create')
  if (!cd.ok) return cd
  if (cd.data.challenge !== challenge) return fail('BAD_CHALLENGE')
  if (typeof cd.data.origin !== 'string' || !originOk(cd.data.origin, rpId)) return fail('BAD_ORIGIN')
  const ad = authDataOf(parts.inner, rpId)
  if (!ad.ok) return ad
  const alg = Number(parts.inner.publicKeyAlgorithm)
  const wanted = ALGS[String(alg)]
  if (!wanted) return fail('BAD_ALG')
  let key
  try {
    key = crypto.createPublicKey({ key: fromB64u(parts.inner.publicKey), format: 'der', type: 'spki' })
  } catch {
    return fail('BAD_KEY')
  }
  if (key.asymmetricKeyType !== wanted) return fail('BAD_KEY')
  return { ok: true, id: parts.id, publicKey: b64u(key.export({ format: 'der', type: 'spki' })), alg, origin: cd.data.origin }
}

/** The challenge an assertion answers, read from its clientData (to find the pending approval) */
export function challengeOf(resp) {
  const parts = split(resp)
  if (!parts) return null
  const cd = clientDataOf(parts.inner, 'webauthn.get')
  return cd.ok && typeof cd.data.challenge === 'string' ? cd.data.challenge : null
}

/**
 * An assertion by a sign-in passkey that is being adopted as an approver (ENG-139): the key is
 * known (`{ publicKey, alg, rpId }`) but the origin was never stored, so it is taken from the
 * assertion's own clientData once it passes the same origin-under-rpId rule registration applies.
 * Everything else is verifyAssertion's. -> { ok, origin } or { ok: false, code }
 */
export function verifyAdoptedAssertion(resp, { publicKey, alg, rpId }, challenge) {
  const parts = split(resp)
  if (!parts) return fail('BAD_RESPONSE')
  const cd = clientDataOf(parts.inner, 'webauthn.get')
  if (!cd.ok) return cd
  if (typeof cd.data.origin !== 'string' || !originOk(cd.data.origin, rpId)) return fail('BAD_ORIGIN')
  const v = verifyAssertion(resp, { publicKey, alg, rpId, origin: cd.data.origin }, challenge)
  return v.ok ? { ok: true, origin: cd.data.origin } : v
}

/** The credential id of an assertion */
export const credentialIdOf = resp => split(resp)?.id ?? null

/**
 * An assertion against an approver `{ publicKey, alg, rpId, origin }` and the challenge it must
 * answer: type, origin as registered, rpId hash, UP + UV, and the signature over
 * authenticatorData || sha256(clientDataJSON).
 */
export function verifyAssertion(resp, approver, challenge) {
  const parts = split(resp)
  if (!parts) return fail('BAD_RESPONSE')
  const cd = clientDataOf(parts.inner, 'webauthn.get')
  if (!cd.ok) return cd
  if (cd.data.challenge !== challenge) return fail('BAD_CHALLENGE')
  if (cd.data.origin !== approver.origin) return fail('BAD_ORIGIN')
  const ad = authDataOf(parts.inner, approver.rpId)
  if (!ad.ok) return ad
  let valid = false
  try {
    const key = crypto.createPublicKey({ key: fromB64u(approver.publicKey), format: 'der', type: 'spki' })
    const data = Buffer.concat([ad.bytes, sha256(cd.raw)])
    const sig = fromB64u(parts.inner.signature)
    if (approver.alg === -7) valid = crypto.verify('sha256', data, { key, dsaEncoding: 'der' }, sig)
    else if (approver.alg === -257) valid = crypto.verify('sha256', data, key, sig)
    else if (approver.alg === -8) valid = crypto.verify(null, data, key, sig)
  } catch {
    valid = false
  }
  return valid ? { ok: true } : fail('BAD_SIGNATURE')
}

/** Approval passwords: scrypt, parameters stored with the hash so they can be raised later */
export const SCRYPT = Object.freeze({ N: 2 ** 15, r: 8, p: 1, keylen: 64 })
export const MIN_PASSWORD = 10

const scrypt = (password, salt, { N, r, p, keylen }) =>
  new Promise((resolve, reject) => crypto.scrypt(password.normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 }, (e, k) => (e ? reject(e) : resolve(k))))

export async function hashPassword(password, params = SCRYPT) {
  const salt = crypto.randomBytes(16)
  return { salt: b64u(salt), hash: b64u(await scrypt(password, salt, params)), params: { ...params } }
}

/** Timing-safe: derives with the stored salt and parameters, compares the bytes */
export async function checkPassword(password, { salt, hash, params }) {
  try {
    const mine = await scrypt(password, fromB64u(salt), params)
    const stored = fromB64u(hash)
    return mine.length === stored.length && crypto.timingSafeEqual(mine, stored)
  } catch {
    return false
  }
}
