'use client'

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'

/** Why passkeys can't work here, in the user's words, or null when they can */
export function passkeyBlocker(): string | null {
  if (typeof window === 'undefined') return null
  if (!window.isSecureContext) {
    return 'מפתחות עובדים רק בחיבור מאובטח (https), או ב-localhost על המחשב עצמו. פתחו את Tazrim בכתובת ה-https שלו.'
  }
  if (!browserSupportsWebAuthn()) return 'הדפדפן הזה לא תומך במפתחות (passkeys).'
  return null
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'משהו השתבש. נסו שוב')
  return data
}

/** The browser's message when the user closed the Face ID / Touch ID prompt, in Hebrew */
function friendly(e: unknown): Error {
  const name = (e as { name?: string })?.name
  if (name === 'NotAllowedError' || name === 'AbortError') return new Error('הפעולה בוטלה או שעבר הזמן. נסו שוב')
  if (name === 'InvalidStateError') return new Error('למכשיר הזה כבר יש מפתח לתזרים')
  return e instanceof Error ? e : new Error('משהו השתבש. נסו שוב')
}

/** The browser's answer to a sign-in style challenge (Face ID / Touch ID), with errors in Hebrew */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function answerChallenge(options: any) {
  try {
    return await startAuthentication({ optionsJSON: options })
  } catch (e) {
    throw friendly(e)
  }
}

export async function signInWithPasskey() {
  const { flowId, options } = await post('/api/auth/options', {})
  let response
  try {
    response = await startAuthentication({ optionsJSON: options })
  } catch (e) {
    throw friendly(e)
  }
  return post('/api/auth/login', { flowId, response })
}

/** Creates a passkey for a challenge from `optionsUrl`; returns the register route's answer */
export async function createPasskey(optionsUrl: string, optionsBody: unknown, label: string): Promise<{ recoveryCode?: string }> {
  const { flowId, options } = await post(optionsUrl, optionsBody)
  let response
  try {
    response = await startRegistration({ optionsJSON: options })
  } catch (e) {
    throw friendly(e)
  }
  return post('/api/auth/register', { flowId, response, label })
}

/** A device name to suggest, from the browser */
export function guessDeviceLabel(): string {
  if (typeof navigator === 'undefined') return ''
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows'
  return ''
}

/** Only same-site paths, so ?next= can't send someone elsewhere after sign-in */
export function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}
