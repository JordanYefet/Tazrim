'use client'

import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
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
}

export interface Approved {
  ok: true
  job?: EgressJob | null
}

/** What the person gave to approve: a signed passkey answer, or the approval password for the flow the begin call opened */
export type Proof = { response: object } | { flowId: string | undefined; password: string }

/** The passkey half of an approval: the browser signs the challenge */
export async function proveWithPasskey(begin: Begin): Promise<Proof> {
  try {
    return { response: await startAuthentication({ optionsJSON: begin.options }) }
  } catch (e) {
    throw friendly(e)
  }
}

export const proveWithPassword = async (begin: Begin, password: string): Promise<Proof> => ({ flowId: begin.flowId, password })

/** The default end of an approval: the updater checks the proof and applies the change */
export const finishApproval = (proof: Proof) => call<Approved>('/approve/finish', proof)

/** Creates the passkey for the options the updater issued and registers it with the code from the file */
export async function registerPasskey(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  code: string,
  name: string
) {
  let response
  try {
    response = await startRegistration({ optionsJSON: options })
  } catch (e) {
    throw friendly(e)
  }
  return call('/approvers/register/finish', { code, name, response })
}

export const registerPassword = (code: string, name: string, password: string) => call('/approvers/register/finish', { code, name, password })

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
