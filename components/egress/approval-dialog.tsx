'use client'

/**
 * Approving a change that loosens the filter (ENG-134): begin → the passkey prompt, or the approval
 * password → finish. The window says what is being approved, in words the app wrote; the updater
 * keeps its own record of what the signature was for (the change log on this page).
 *
 * The same window approves an update that replaces the compose files (ENG-137): there `finish` just
 * hands the proof back, and the update job checks it itself (updater/compose-update + egress.verifyApproval).
 *
 * ENG-141: the very first approval (`begin.bootstrap`) pins the key or sign-in password used, so there
 * is nothing to set up before it. Adding a key later (`add-approver`) is two steps in this one window:
 * an existing approver approves, then the person's own sign-in key (or password) proves it is theirs.
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { AppDialog } from '@/components/ui/app-dialog'
import { passkeyBlocker } from '@/components/auth/passkey-client'
import { providerLabel } from '@/lib/egress/allowlist'
import type { ChangeRequest } from '@/lib/egress/types'
import { adoptPasskeyWithToken, adoptPasswordWithToken, call, finishApproval, proveWithPasskey, proveWithPassword, type Approved, type Begin, type Proof } from './api'
import { Busy, Host, INPUT, PRIMARY, SECONDARY } from './ui'

/** "של בנק לאומי" / "של כל הספקים": whose list a site is added to (ENG-142) */
const forProvider = (id: string | undefined) => (id ? `של ${providerLabel(id) ?? id}` : 'של כל הספקים')

export function describeChange(c: ChangeRequest): React.ReactNode {
  switch (c.action) {
    case 'add-domain':
      return <>להוסיף את האתר <Host>{c.domain}</Host> לרשימה המותרת {forProvider(c.provider)}</>
    case 'remove-domain':
      return <>להסיר את האתר <Host>{c.domain}</Host> מהרשימה המותרת {forProvider(c.provider)}</>
    case 'turn-off':
      return 'לכבות את בידוד הרשת'
    case 'remove-approver':
      return 'להסיר מפתח אישור'
    case 'add-approver':
      return c.kind === 'password' ? 'להוסיף את סיסמת הכניסה שלך כסיסמת אישור' : 'להוסיף את מפתח הכניסה שלך כמפתח אישור'
    case 'update-compose':
      return <>להחליף את קובצי ההתקנה בגרסה <Host>v{c.version}</Host></>
  }
}

/** Why this needs an approval, under the change */
function whyText(c: ChangeRequest | null): string {
  if (c?.action === 'update-compose') return 'הקבצים האלה קובעים מה רץ על המחשב ומה מותר לו ברשת, ולכן ההחלפה שלהם צריכה אישור.'
  if (c?.action === 'add-approver') return 'מי שמאשר יכול להרחיב את מה שמותר ברשת, ולכן קודם מאשר מי שכבר מאשר, ואז מוכיחים שהמפתח שלך.'
  return 'השינוי מרחיב את מה שהאפליקציה יכולה לעשות ברשת, ולכן הוא צריך אישור.'
}

/** add-approver, after its approval: the new key's turn */
type Adoption = { token: string; options: unknown }

type Phase = { s: 'loading' } | { s: 'ready'; begin: Begin } | { s: 'failed'; error: string }

export function ApprovalDialog<R = Approved>({
  change,
  onClose,
  onApproved,
  finish = finishApproval as unknown as (proof: Proof) => Promise<R>,
  confirmLabel = 'אישור',
}: {
  change: ChangeRequest | null
  onClose: () => void
  onApproved: (r: R, c: ChangeRequest) => void
  /** What happens with the proof: the egress default asks the updater to apply the change */
  finish?: (proof: Proof) => Promise<R>
  confirmLabel?: string
}) {
  const [phase, setPhase] = useState<Phase>({ s: 'loading' })
  const [busy, setBusy] = useState<'key' | 'password' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [blocker, setBlocker] = useState<string | null>(null)
  const [adoption, setAdoption] = useState<Adoption | null>(null)
  const last = useRef<ChangeRequest | null>(null)
  if (change) last.current = change
  const shown = change ?? last.current

  useEffect(() => {
    setBlocker(passkeyBlocker())
  }, [])
  useEffect(() => {
    if (!change) return
    let live = true
    setPhase({ s: 'loading' })
    setError(null)
    setPassword('')
    setAdoption(null)
    call<Begin>('/approve/begin', { change }).then(
      begin => live && setPhase({ s: 'ready', begin }),
      e => live && setPhase({ s: 'failed', error: (e as Error).message })
    )
    return () => {
      live = false
    }
  }, [change])

  async function run(kind: 'key' | 'password', prove: () => Promise<Proof>) {
    if (!change || busy) return
    setBusy(kind)
    setError(null)
    try {
      const r = await finish(await prove())
      if (change.action === 'add-approver') {
        const { adoptToken, adoptOptions } = r as unknown as Approved
        if (!adoptToken || (change.kind === 'passkey' && !adoptOptions)) throw new Error('משהו השתבש. נסו שוב')
        setPassword('')
        setAdoption({ token: adoptToken, options: adoptOptions })
        return
      }
      onApproved(r, change)
    } catch (e) {
      setError((e as Error).message)
      if (kind === 'password') setPassword('')
    } finally {
      setBusy(null)
    }
  }

  /** Step 2 of add-approver: the person's own sign-in key (or password) proves it is theirs */
  async function adopt(kind: 'key' | 'password') {
    if (!change || !adoption || busy) return
    setBusy(kind)
    setError(null)
    try {
      const r = kind === 'key' ? await adoptPasskeyWithToken(adoption.options, adoption.token) : await adoptPasswordWithToken(adoption.token, password)
      onApproved(r as unknown as R, change)
    } catch (e) {
      setError((e as Error).message)
      if (kind === 'password') setPassword('')
    } finally {
      setBusy(null)
    }
  }

  const begin = phase.s === 'ready' ? phase.begin : null
  const adding = shown?.action === 'add-approver'
  return (
    <AppDialog open={!!change} onOpenChange={o => !o && !busy && onClose()} title="אישור שינוי" className="sm:max-w-md">
      <div className="mt-3 space-y-4 text-sm leading-relaxed">
        <p className="text-pretty">
          {shown && describeChange(shown)}. {whyText(shown)}
        </p>

        {adding && (
          <p className="text-xs font-medium text-muted-foreground">
            {adoption ? 'שלב 2 מתוך 2: מוכיחים שהמפתח שלך' : 'שלב 1 מתוך 2: אישור עם מפתח אישור קיים'}
          </p>
        )}
        {begin?.bootstrap && (
          <p className="text-xs text-muted-foreground text-pretty">זה האישור הראשון: המפתח (או הסיסמה) שתשתמשו בו עכשיו יאשר גם שינויים הבאים.</p>
        )}

        {/* The area keeps its height while the challenge loads */}
        <div className="min-h-24 space-y-4" aria-live="polite">
          {adoption && shown?.action === 'add-approver' && (
            <div className="space-y-2">
              {shown.kind === 'passkey' ? (
                <button type="button" className={`${PRIMARY} w-full`} disabled={!!busy || !!blocker} onClick={() => void adopt('key')}>
                  <Busy busy={busy === 'key'}>הוכחה עם מפתח הכניסה (Face ID, Touch ID)</Busy>
                </button>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={e => {
                    e.preventDefault()
                    if (password) void adopt('password')
                  }}
                >
                  <label htmlFor="egress-adopt-password" className="text-sm font-medium">
                    סיסמת הכניסה שלי
                  </label>
                  <div className="flex gap-2">
                    <input id="egress-adopt-password" type="password" autoComplete="current-password" className={INPUT} value={password} onChange={e => setPassword(e.target.value)} disabled={!!busy} />
                    <button type="submit" className={SECONDARY} disabled={!password || !!busy}>
                      <Busy busy={busy === 'password'}>הוספה</Busy>
                    </button>
                  </div>
                </form>
              )}
              {blocker && shown.kind === 'passkey' && <p className="text-xs text-muted-foreground text-pretty">{blocker}</p>}
            </div>
          )}
          {!adoption && phase.s === 'loading' && (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              מכינים את האישור…
            </p>
          )}
          {!adoption && phase.s === 'failed' && (
            <p role="alert" className="text-destructive">
              {phase.error}
            </p>
          )}
          {!adoption && begin?.options && (
            <div className="space-y-2">
              <button type="button" className={`${PRIMARY} w-full`} disabled={!!busy || !!blocker} onClick={() => void run('key', () => proveWithPasskey(begin))}>
                <Busy busy={busy === 'key'}>אישור עם מפתח (Face ID, Touch ID)</Busy>
              </button>
              {blocker && <p className="text-xs text-muted-foreground text-pretty">{blocker}</p>}
            </div>
          )}
          {!adoption && begin?.options && begin.passwordAllowed && <p className="text-center text-xs text-muted-foreground">או</p>}
          {!adoption && begin?.passwordAllowed && (
            <form
              className="space-y-2"
              onSubmit={e => {
                e.preventDefault()
                if (password) void run('password', () => proveWithPassword(begin, password))
              }}
            >
              <label htmlFor="egress-approve-password" className="text-sm font-medium">
                {begin.bootstrap ? 'סיסמת הכניסה שלי' : 'סיסמת אישור'}
              </label>
              <div className="flex gap-2">
                <input
                  id="egress-approve-password"
                  type="password"
                  autoComplete={begin.bootstrap ? 'current-password' : 'off'}
                  className={INPUT}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={!!busy}
                />
                <button type="submit" className={SECONDARY} disabled={!password || !!busy}>
                  <Busy busy={busy === 'password'}>{confirmLabel}</Busy>
                </button>
              </div>
              <p className="text-xs text-muted-foreground text-pretty">מפתח בטוח יותר: את הסיסמה מקלידים בתוך האפליקציה עצמה.</p>
            </form>
          )}
          {!adoption && begin && !begin.options && !begin.passwordAllowed && (
            <p role="alert" className="text-destructive">
              אין דרך לאשר: אין לך מפתח כניסה (Face ID, Touch ID) או סיסמת כניסה. מוסיפים אותם בהגדרות ← אנשים.
            </p>
          )}
        </div>

        <p role="alert" className="min-h-5 text-destructive">
          {error}
        </p>
        <button type="button" className={`${SECONDARY} w-full`} disabled={!!busy} onClick={onClose}>
          ביטול
        </button>
      </div>
    </AppDialog>
  )
}
