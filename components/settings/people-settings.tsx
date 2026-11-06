'use client'

import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { KeyRound, LogOut, Smartphone, UserPlus } from 'lucide-react'
import { AppDialog } from '@/components/ui/app-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RecoveryCode } from '@/components/auth/recovery-code'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from '@/components/auth/passkey-client'
import { errorText, secondaryButton } from '@/components/auth/ui'

interface Device { id: string; label: string; createdAt: string; lastUsedAt: string | null }
interface Person { id: string; name: string; passkeys: Device[] }
interface PeopleInfo { people: Person[]; me: string | null; thisDevice: string | null; hasRecoveryCode: boolean }

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' }) : 'עוד לא')

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'משהו השתבש. נסו שוב')
  return data
}

/**
 * Settings → People (ENG-89): everyone in the household and their devices,
 * invite links (a new person or another device), revoking a device, a passkey
 * on this device, a new recovery code, and signing out. Everyone has the same rights.
 */
export function PeopleSettings({ recovered }: { recovered: boolean }) {
  const [info, setInfo] = useState<PeopleInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ title: string; url: string; qr: string; expiresAt: string } | null>(null)
  const [revoking, setRevoking] = useState<Device | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRecovery, setConfirmRecovery] = useState(false)
  const [recovery, setRecovery] = useState<string | null>(null)

  const load = useCallback(() => {
    call('/api/people', 'GET').then(setInfo, e => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function makeInvite(person: Person | null) {
    setError(null)
    try {
      const { url, expiresAt } = await call('/api/people/invites', 'POST', { personId: person?.id ?? null })
      const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 })
      setInvite({ title: person ? `מכשיר נוסף עבור ${person.name}` : 'הזמנת אדם חדש', url, qr, expiresAt })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function addHere() {
    const blocker = passkeyBlocker()
    if (blocker) return setError(blocker)
    setError(null)
    setBusy(true)
    try {
      await createPasskey('/api/people/devices', {}, guessDeviceLabel() || 'מכשיר')
      load()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  async function revoke() {
    if (!revoking) return
    setBusy(true)
    try {
      await call(`/api/people/passkeys/${revoking.id}`, 'DELETE')
      // This device's own key: its session is gone with it
      if (revoking.id === info?.thisDevice) return window.location.assign('/login')
      setRevoking(null)
      load()
    } catch (e) {
      setError((e as Error).message)
      setRevoking(null)
    }
    setBusy(false)
  }

  async function regenerate() {
    setBusy(true)
    try {
      const { recoveryCode } = await call('/api/people/recovery', 'POST')
      setRecovery(recoveryCode)
      setConfirmRecovery(false)
      load()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  async function signOut() {
    await call('/api/auth/logout', 'POST').catch(() => {})
    window.location.assign('/login')
  }

  const row = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2'
  return (
    <div className="space-y-3">
      <div>
        <h2 id="people-title" className="text-lg font-semibold">אנשים ומכשירים</h2>
        <p className="text-sm text-muted-foreground">כל מי שכאן רואה ועורך את אותם נתונים. כניסה עם מפתח (passkey) בלבד.</p>
      </div>
      {recovered && info?.thisDevice === null && (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm">
          נכנסתם עם קוד השחזור, והוא כבר לא בתוקף. הוסיפו מפתח במכשיר הזה וצרו קוד שחזור חדש.
        </p>
      )}
      {error && <p className={errorText} role="alert">{error}</p>}

      <div className="space-y-3 rounded-xl surface p-4 md:p-6">
        {!info ? (
          <p className="text-sm text-muted-foreground">טוען…</p>
        ) : (
          info.people.map(p => (
            <div key={p.id} className="space-y-2 border-b pb-3 last:border-b-0 last:pb-0">
              <div className={row}>
                <p className="font-medium">{p.name}{p.id === info.me && <span className="ms-2 text-xs text-muted-foreground">(את/ה)</span>}</p>
                <button type="button" onClick={() => makeInvite(p)} className={secondaryButton}>
                  <Smartphone className="h-4 w-4" aria-hidden />
                  מכשיר נוסף
                </button>
              </div>
              {p.passkeys.length === 0 && <p className="text-sm text-muted-foreground">אין מכשירים</p>}
              <ul className="space-y-1.5">
                {p.passkeys.map(d => (
                  <li key={d.id} className={`${row} text-sm`}>
                    <span className="min-w-0">
                      <KeyRound className="me-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                      {d.label}
                      {d.id === info.thisDevice && <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs">המכשיר הזה</span>}
                      <span className="ms-2 text-xs text-muted-foreground">נוסף {date(d.createdAt)} · שימוש אחרון {date(d.lastUsedAt)}</span>
                    </span>
                    <button type="button" onClick={() => setRevoking(d)} className="text-sm text-destructive underline-offset-4 hover:underline dark:text-red-400">
                      ביטול
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => makeInvite(null)} className={secondaryButton}>
          <UserPlus className="h-4 w-4" aria-hidden />
          הזמנת אדם
        </button>
        <button type="button" onClick={addHere} disabled={busy} className={secondaryButton}>
          <KeyRound className="h-4 w-4" aria-hidden />
          מפתח במכשיר הזה
        </button>
        <button type="button" onClick={() => setConfirmRecovery(true)} className={secondaryButton}>
          קוד שחזור חדש
        </button>
        <button type="button" onClick={signOut} className={secondaryButton}>
          <LogOut className="h-4 w-4" aria-hidden />
          יציאה
        </button>
      </div>
      {info && !info.hasRecoveryCode && <p className="text-sm text-muted-foreground">אין כרגע קוד שחזור בתוקף.</p>}

      <AppDialog open={!!invite} onOpenChange={o => !o && setInvite(null)} title={invite?.title ?? ''}>
        {invite && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground text-pretty">
              פותחים את הקישור (או סורקים את הקוד) במכשיר החדש. עובד פעם אחת, עד {new Date(invite.expiresAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={invite.qr} alt="קוד QR של קישור ההזמנה" width={240} height={240} className="mx-auto rounded-xl bg-white p-2" />
            <RecoveryCode code={invite.url} />
          </div>
        )}
      </AppDialog>

      <AppDialog open={!!recovery} onOpenChange={o => !o && setRecovery(null)} title="קוד שחזור חדש">
        {recovery && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground text-pretty">הקוד הקודם כבר לא עובד. שמרו את זה במקום בטוח, הוא לא יוצג שוב.</p>
            <RecoveryCode code={recovery} />
          </div>
        )}
      </AppDialog>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={o => !o && setRevoking(null)}
        onConfirm={revoke}
        busy={busy}
        title={`לבטל את "${revoking?.label}"?`}
        description={revoking?.id === info?.thisDevice ? 'זה המכשיר הזה: תצאו מיד.' : 'המכשיר יצא בבקשה הבאה שלו ולא יוכל להיכנס שוב בלי הזמנה חדשה.'}
        confirmLabel="ביטול המכשיר"
        cancelLabel="השארה"
      />
      <ConfirmDialog
        open={confirmRecovery}
        onOpenChange={setConfirmRecovery}
        onConfirm={regenerate}
        busy={busy}
        destructive={false}
        title="ליצור קוד שחזור חדש?"
        description="הקוד הקודם יפסיק לעבוד מיד."
        confirmLabel="יצירה"
        cancelLabel="ביטול"
      />
    </div>
  )
}
