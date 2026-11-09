'use client'

/**
 * The browser side of the vault (ENG-90): a passkey prompt that also asks the
 * passkey for its PRF output. @simplewebauthn/browser passes extensions through
 * as JSON and drops PRF's binary results, so this one call is made directly.
 */

const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(b, c => c.charCodeAt(0))
}
const toB64u = (buf: ArrayBuffer | ArrayBufferView) => {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function post<T = Record<string, unknown>>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'משהו השתבש. נסו שוב')
  return data
}

export type VaultPurpose = 'unlock' | 'create' | 'add'

/** Face ID / Touch ID for the vault: creates it, opens it, or gives this passkey a copy */
export async function vaultWithPasskey(purpose: VaultPurpose): Promise<{ recoveryKey?: string }> {
  if (!window.isSecureContext || !window.PublicKeyCredential) throw new Error('הכספת נפתחת רק בחיבור מאובטח (https) עם מפתח')
  const { flowId, options, prf } = await post<{
    flowId: string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: any
    prf: Record<string, string>
  }>('/api/vault/options', { purpose })

  let cred: PublicKeyCredential
  try {
    cred = (await navigator.credentials.get({
      publicKey: {
        challenge: fromB64u(options.challenge),
        rpId: options.rpId,
        timeout: options.timeout,
        userVerification: options.userVerification,
        allowCredentials: options.allowCredentials.map((c: { id: string; transports?: AuthenticatorTransport[] }) => ({
          type: 'public-key',
          id: fromB64u(c.id),
          transports: c.transports,
        })),
        extensions: {
          prf: { evalByCredential: Object.fromEntries(Object.entries(prf).map(([id, salt]) => [id, { first: fromB64u(salt) }])) },
        } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential
  } catch (e) {
    const name = (e as { name?: string })?.name
    throw new Error(name === 'NotAllowedError' || name === 'AbortError' ? 'הפעולה בוטלה או שעבר הזמן. נסו שוב' : 'הפתיחה נכשלה. נסו שוב')
  }
  const a = cred.response as AuthenticatorAssertionResponse
  const first = (cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf?.results?.first
  return post('/api/vault/passkey', {
    flowId,
    prf: first ? toB64u(first) : '',
    response: {
      id: cred.id,
      rawId: toB64u(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
      clientExtensionResults: {},
      response: {
        clientDataJSON: toB64u(a.clientDataJSON),
        authenticatorData: toB64u(a.authenticatorData),
        signature: toB64u(a.signature),
        userHandle: a.userHandle ? toB64u(a.userHandle) : undefined,
      },
    },
  })
}
