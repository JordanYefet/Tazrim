'use client'

import { startAuthentication } from '@simplewebauthn/browser'
import type { EgressJob, EgressView } from '@/lib/egress/types'

/** A refusal from /api/egress: the route's own Hebrew line, and its fixed code */
export class EgressError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
  }
}

const FALLBACK = 'משהו השתבש. נסו שוב'

export async function call<T = Record<string, unknown>>(route: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/egress${route}`, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new EgressError(FALLBACK)
  }
  const json = (await res.json().catch(() => null)) as (T & { error?: string; code?: string }) | null
  if (!res.ok || !json) throw new EgressError(json?.error || FALLBACK, json?.code)
  return json
}

export const fetchView = () => call<EgressView>('')

/** The browser's own words for a closed or timed-out prompt, in Hebrew */
function friendly(e: unknown): Error {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError') return new EgressError('הפעולה בוטלה או שעבר הזמן. נסו שוב')
  if (name === 'InvalidStateError') return new EgressError('למכשיר הזה כבר יש מפתח אישור')
  return e instanceof Error ? e : new EgressError(FALLBACK)
}

export interface Begin {
  flowId?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any | null
  passwordAllowed: boolean
  /** The first approval (ENG-141): the key or sign-in password used now is pinned and approves the next changes too */
  bootstrap?: boolean
}

export interface Approved {
  ok: true
  job?: EgressJob | null
  /** add-approver (ENG-141): the approval is made; the new key now proves it is the person's, with this token */
  adoptToken?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adoptOptions?: any
}

/** What the person gave to approve: a signed passkey answer, or the approval password for the flow the begin call opened */
export type Proof = { response: object } | { flowId: string | undefined; password: string; signin?: true }

/** The passkey half of an approval: the browser signs the challenge */
export async function proveWithPasskey(begin: Begin): Promise<Proof> {
  try {
    return { response: await startAuthentication({ optionsJSON: begin.options }) }
  } catch (e) {
    throw friendly(e)
  }
}

/** On a first approval the password is the sign-in password: the app checks it before the updater pins it */
export const proveWithPassword = async (begin: Begin, password: string): Promise<Proof> => ({ flowId: begin.flowId, password, ...(begin.bootstrap ? { signin: true as const } : {}) })

/** The default end of an approval: the updater checks the proof and applies the change */
export const finishApproval = (proof: Proof) => call<Approved>('/approve/finish', proof)

/** What the signed-in person can adopt as an approval key: how many sign-in passkeys, and whether they have a sign-in password */
export interface SigninChoices {
  passkeys: number
  password: boolean
  /** Credential ids of the sign-in passkeys: those already approvers need no adding */
  ids: string[]
}
export const fetchSignin = () => call<SigninChoices>('/approvers/signin')

/** Adopting the sign-in passkey: it signs the challenge the updater issued (the same Face ID prompt as an approval); the name is made by the app */
export async function adoptPasskey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  code: string
) {
  let assertion
  try {
    assertion = await startAuthentication({ optionsJSON: options })
  } catch (e) {
    throw friendly(e)
  }
  return call('/approvers/register/finish', { code, assertion })
}

/** The second step of adding an approver: the new key signs what the approval returned (the same Face ID prompt) */
export async function adoptPasskeyWithToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  token: string
) {
  let assertion
  try {
    assertion = await startAuthentication({ optionsJSON: options })
  } catch (e) {
    throw friendly(e)
  }
  return call('/approvers/register/finish', { token, assertion })
}

export const adoptPasswordWithToken = (token: string, password: string) => call('/approvers/register/finish', { token, source: 'signin-password', password })

/** Adopting the sign-in password: the app checks it is the person's own before the updater hears of it */
export const adoptPassword = (code: string, password: string) => call('/approvers/register/finish', { code, source: 'signin-password', password })

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
