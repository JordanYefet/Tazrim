/**
 * Passkeys (ENG-89) with @simplewebauthn/server: registration and sign-in
 * options, kept server-side as one-time challenges, and their verification.
 *
 * The relying party is the host the page was opened on, so a passkey made on
 * https://tazrim.home.arpa works there only. WebAuthn needs a secure context:
 * HTTPS, or http://localhost on the machine itself.
 */
import { randomUUID } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { prisma } from '@/lib/db/client'
import { CHALLENGE_TTL_MS } from './config'

const RP_NAME = 'תזרים'

export interface RelyingParty {
  rpID: string
  origin: string
  secure: boolean
}

/**
 * The page's origin as the browser saw it: the proxy's X-Forwarded-Proto and
 * X-Forwarded-Host when Caddy is in front, else the Host header. With
 * TAZRIM_ORIGINS set (comma-separated), any other origin is refused.
 */
export function relyingParty(headers: Headers): RelyingParty | null {
  const host = (headers.get('x-forwarded-host') ?? headers.get('host') ?? '').split(',')[0].trim().toLowerCase()
  const proto = (headers.get('x-forwarded-proto') ?? 'http').split(',')[0].trim().toLowerCase()
  if (!host || (proto !== 'http' && proto !== 'https')) return null
  const origin = `${proto}://${host}`
  const allowed = process.env.TAZRIM_ORIGINS?.split(',').map(s => s.trim().replace(/\/+$/, '').toLowerCase()).filter(Boolean)
  if (allowed?.length && !allowed.includes(origin)) return null
  const rpID = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.replace(/:\d+$/, '')
  return { rpID, origin, secure: proto === 'https' }
}

/** What a challenge was issued for, checked again when the browser answers */
export type Flow =
  | { kind: 'login' }
  | { kind: 'setup'; personId: string; name: string }
  | { kind: 'invite'; inviteId: string; personId: string; name: string; isNewPerson: boolean }
  | { kind: 'device'; personId: string }

interface Pending {
  challenge: string
  flow: Flow
  rp: RelyingParty
  expiresAt: number
}

const g = globalThis as unknown as { __tazrimChallenges?: Map<string, Pending> }
const challenges = (g.__tazrimChallenges ??= new Map())

function remember(challenge: string, flow: Flow, rp: RelyingParty): string {
  const now = Date.now()
  for (const [k, p] of challenges) if (p.expiresAt <= now) challenges.delete(k)
  const flowId = randomUUID()
  challenges.set(flowId, { challenge, flow, rp, expiresAt: now + CHALLENGE_TTL_MS })
  return flowId
}

/** The pending challenge, removed on first read: an answer is checked once, whatever the outcome. */
export function takeChallenge(flowId: unknown): Pending | null {
  if (typeof flowId !== 'string') return null
  const p = challenges.get(flowId)
  challenges.delete(flowId)
  return p && p.expiresAt > Date.now() ? p : null
}

function parseTransports(json: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!json) return undefined
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v : undefined
  } catch {
    return undefined
  }
}

/** Options to create a passkey for a person (new or existing), and the flow id to answer with. */
export async function registrationOptions(rp: RelyingParty, flow: Exclude<Flow, { kind: 'login' }>, userName: string) {
  const existing = await prisma.passkey.findMany({
    where: { personId: flow.personId },
    select: { credentialId: true, transports: true },
  })
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.rpID,
    userName,
    userDisplayName: userName,
    userID: new TextEncoder().encode(flow.personId),
    attestationType: 'none',
    excludeCredentials: existing.map(c => ({ id: c.credentialId, transports: parseTransports(c.transports) })),
    // A discoverable credential, so sign-in needs no user name; Face ID / Touch ID or the device PIN every time
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  })
  return { flowId: remember(options.challenge, flow, rp), options }
}

export interface NewCredential {
  credentialId: string
  publicKey: Uint8Array
  counter: number
  transports: string | null
}

export async function verifyRegistration(p: Pending, response: RegistrationResponseJSON): Promise<NewCredential | null> {
  try {
    const { verified, registrationInfo } = await verifyRegistrationResponse({
      response,
      expectedChallenge: p.challenge,
      expectedOrigin: p.rp.origin,
      expectedRPID: p.rp.rpID,
      requireUserVerification: true,
    })
    if (!verified || !registrationInfo) return null
    const c = registrationInfo.credential
    return {
      credentialId: c.id,
      publicKey: c.publicKey,
      counter: c.counter,
      transports: c.transports?.length ? JSON.stringify(c.transports) : null,
    }
  } catch {
    return null
  }
}

/** Sign-in options: no allow-list, the device offers whichever passkey it has for this host. */
export async function authenticationOptions(rp: RelyingParty) {
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: 'required' })
  return { flowId: remember(options.challenge, { kind: 'login' }, rp), options }
}

/** The passkey that signed the challenge (its counter updated), or null. */
export async function verifyAuthentication(p: Pending, response: AuthenticationResponseJSON) {
  if (typeof response?.id !== 'string') return null
  const passkey = await prisma.passkey.findUnique({ where: { credentialId: response.id } })
  if (!passkey) return null
  try {
    const { verified, authenticationInfo } = await verifyAuthenticationResponse({
      response,
      expectedChallenge: p.challenge,
      expectedOrigin: p.rp.origin,
      expectedRPID: p.rp.rpID,
      requireUserVerification: true,
      credential: {
        id: passkey.credentialId,
        publicKey: new Uint8Array(passkey.publicKey),
        counter: passkey.counter,
        transports: parseTransports(passkey.transports),
      },
    })
    if (!verified) return null
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: authenticationInfo.newCounter, lastUsedAt: new Date() },
    })
    return passkey
  } catch {
    return null
  }
}
