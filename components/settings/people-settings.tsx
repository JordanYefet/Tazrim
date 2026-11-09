'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { ChevronLeft, KeyRound, Laptop, LockKeyhole, LogOut, ShieldCheck, Smartphone, UserPlus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { AppDialog } from '@/components/ui/app-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { RecoveryCode } from '@/components/auth/recovery-code'
import { createPasskey, guessDeviceLabel, passkeyBlocker } from '@/components/auth/passkey-client'
import { errorText, primaryButton, secondaryButton } from '@/components/auth/ui'
import { inputClass } from '@/components/accounts/add-account-form'

interface Device { id: string; label: string; createdAt: string; lastUsedAt: string | null }
interface Person { id: string; name: string; hasPassword: boolean; passkeys: Device[] }
interface PeopleInfo { people: Person[]; me: string | null; thisDevice: string | null; hasRecoveryCode: boolean }

const date = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })

/** A person's initial, tinted by position: the app's blue, then green, then the card amber */
const AVATARS = ['bg-primary/10 text-primary', 'bg-[hsl(var(--income)/0.12)] text-[hsl(var(--income))]', 'bg-[hsl(var(--cc)/0.14)] text-[hsl(var(--cc))]']

const ROW = 'flex min-h-14 items-center gap-3.5 px-4 py-2.5 md:px-5 [&+&]:border-t'
const ROW_BUTTON = cn(ROW, 'w-full text-start transition-[background-color,transform] duration-quick ease-ui hover:bg-muted/60 active:scale-[0.99] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring')
const TEXT_BUTTON = 'shrink-0 rounded-lg px-2 py-2 text-sm font-medium transition-colors duration-quick focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
/** Revoke and remove stay grey until pointed at, so a list of devices is not a column of red */
const QUIET_DANGER = 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive dark:hover:text-red-400'

/** The device's label, as guessed when its passkey was made: a computer or a phone */
const isComputer = (label: string) => /mac|windows|linux|chrome ?os|מחשב/i.test(label)

function RowIcon({ icon: Icon, muted = false }: { icon: LucideIcon; muted?: boolean }) {
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-muted', muted ? 'text-muted-foreground' : 'text-foreground/80')} aria-hidden>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  )
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'משהו השתבש. נסו שוב')
  return data
}

/**
 * Settings → People (ENG-89): everyone in the household and their devices,
 * invite links (a new person or another device), revoking a device, a passkey
 * on this device, your own password (a way in on a device without a passkey),
 * a new recovery code, and signing out. Everyone has the same rights.
 * `open` (from the profile menu) opens adding a device for me, or my password, at once.
 */
export function PeopleSettings({ recovered, open }: { recovered: boolean; open?: 'device' | 'password' }) {
  const [info, setInfo] = useState<PeopleInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ title: string; url: string; qr: string; expiresAt: string } | null>(null)
  const [revoking, setRevoking] = useState<Device | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmRecovery, setConfirmRecovery] = useState(false)
  const [recovery, setRecovery] = useState<string | null>(null)
  const [editingPassword, setEditingPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [repeatPassword, setRepeatPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [removingPassword, setRemovingPassword] = useState(false)

  const load = useCallback(() => {
    call('/api/people', 'GET').then(setInfo, e => setError(e.message))
  }, [])
  useEffect(load, [load])

  // The profile menu's shortcuts, once the household has loaded; the URL drops ?open= so a refresh doesn't reopen it
  const opened = useRef(false)
  useEffect(() => {
    if (!open || !info || opened.current) return
    opened.current = true
    window.history.replaceState(null, '', '/settings/people')
    const me = info.people.find(p => p.id === info.me)
    if (open === 'password') setEditingPassword(true)
    else if (me) makeInvite(me)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, info])

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

  function closePassword() {
    setEditingPassword(false)
    setNewPassword('')
    setRepeatPassword('')
    setPasswordError(null)
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword !== repeatPassword) return setPasswordError('הסיסמאות לא זהות')
    setBusy(true)
    setPasswordError(null)
    try {
      await call('/api/people/password', 'PUT', { password: newPassword })
      closePassword()
      load()
    } catch (e) {
      setPasswordError((e as Error).message)
    }
    setBusy(false)
  }

  async function removePassword() {
    setBusy(true)
    try {
      await call('/api/people/password', 'DELETE')
      load()
    } catch (e) {
      setError((e as Error).message)
    }
    setRemovingPassword(false)
    setBusy(false)
  }

  async function signOut() {
    await call('/api/auth/logout', 'POST').catch(() => {})
    window.location.assign('/login')
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">אנשים ומכשירים</h1>
        <p className="text-sm text-muted-foreground text-pretty">כל מי שכאן רואה ועורך את אותם נתונים. נכנסים עם מפתח (passkey), ומי שרוצה גם עם סיסמה.</p>
      </div>
      {recovered && info?.thisDevice === null && (
        <p className="rounded-xl bg-muted px-3 py-2 text-sm text-pretty">
          נכנסתם עם קוד השחזור, והוא כבר לא בתוקף. הוסיפו מפתח במכשיר הזה וצרו קוד שחזור חדש.
        </p>
      )}
      {error && <p className={errorText} role="alert">{error}</p>}

      {!info ? (
        <div className="h-40 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" aria-label="טוען" />
      ) : (
        info.people.map((p, i) => (
          <section key={p.id} aria-label={p.name} className="overflow-hidden rounded-2xl surface">
            <div className="flex items-center gap-3.5 px-4 py-4 md:px-5">
              <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-bold', AVATARS[i % AVATARS.length])} aria-hidden>
                {[...p.name][0]}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-[17px] font-semibold">{p.name}</span>
                {p.id === info.me && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">את/ה</span>}
              </span>
              <button type="button" onClick={() => makeInvite(p)} aria-label={`מכשיר נוסף עבור ${p.name}`} className={secondaryButton}>
                <Smartphone className="h-4 w-4" aria-hidden />
                {/* Icon only on a narrow phone, so the name keeps its room */}
                <span className="max-[420px]:sr-only">מכשיר נוסף</span>
              </button>
            </div>
            <ul className="border-t">
              {p.passkeys.map(d => (
                <li key={d.id} className={ROW}>
                  <RowIcon icon={isComputer(d.label) ? Laptop : Smartphone} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-[15px] font-medium">
                      <span className="truncate">{d.label}</span>
                      {d.id === info.thisDevice && <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">המכשיר הזה</span>}
                    </span>
                    <span className="block text-[13px] text-muted-foreground text-pretty">
                      מפתח. נוסף ב-{date(d.createdAt)}, {d.lastUsedAt ? `שימוש אחרון ${date(d.lastUsedAt)}` : 'עוד לא בשימוש'}
                    </span>
                  </span>
                  <button type="button" onClick={() => setRevoking(d)} aria-label={`ביטול ${d.label}`} className={cn(TEXT_BUTTON, QUIET_DANGER)}>
                    ביטול
                  </button>
                </li>
              ))}
              {p.passkeys.length === 0 && (
                <li className={ROW}>
                  <RowIcon icon={Smartphone} muted />
                  <span className="flex-1 text-[15px] text-muted-foreground">אין מכשירים</span>
                </li>
              )}
              <li className={ROW}>
                <RowIcon icon={LockKeyhole} muted={!p.hasPassword} />
                {p.id === info.me ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium">סיסמה</span>
                      <span className="block text-[13px] text-muted-foreground text-pretty">
                        {p.hasPassword ? 'מוגדרת. לכניסה ממכשיר בלי מפתח' : 'לא מוגדרת. אפשר להוסיף, לכניסה ממכשיר בלי מפתח'}
                      </span>
                    </span>
                    <button type="button" onClick={() => setEditingPassword(true)} className={cn(TEXT_BUTTON, 'text-primary hover:bg-primary/10')}>
                      {p.hasPassword ? 'שינוי' : 'הגדרה'}
                    </button>
                    {p.hasPassword && (
                      <button type="button" onClick={() => setRemovingPassword(true)} className={cn(TEXT_BUTTON, QUIET_DANGER)}>
                        הסרה
                      </button>
                    )}
                  </>
                ) : (
                  <span className={cn('flex-1 text-[15px]', p.hasPassword ? 'font-medium' : 'text-muted-foreground')}>{p.hasPassword ? 'יש סיסמה' : 'אין סיסמה'}</span>
                )}
              </li>
            </ul>
          </section>
        ))
      )}

      <section aria-labelledby="household-title" className="space-y-2">
        <h2 id="household-title" className="px-1 text-[13px] font-semibold text-muted-foreground">משק הבית</h2>
        <ul className="overflow-hidden rounded-2xl surface">
          <li className="border-b">
            <button type="button" onClick={() => makeInvite(null)} className={ROW_BUTTON}>
              <RowIcon icon={UserPlus} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">הזמנת אדם</span>
                <span className="block text-[13px] text-muted-foreground">קישור או QR, עובד פעם אחת, לכ-15 דקות</span>
              </span>
              <ChevronLeft className="h-[18px] w-[18px] text-muted-foreground/70" aria-hidden />
            </button>
          </li>
          <li className="border-b">
            <button type="button" onClick={addHere} disabled={busy} className={ROW_BUTTON}>
              <RowIcon icon={KeyRound} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">מפתח במכשיר הזה</span>
                <span className="block text-[13px] text-muted-foreground">Face ID, Touch ID או קוד המכשיר</span>
              </span>
              <ChevronLeft className="h-[18px] w-[18px] text-muted-foreground/70" aria-hidden />
            </button>
          </li>
          <li className={ROW}>
            <RowIcon icon={ShieldCheck} muted={!!info && !info.hasRecoveryCode} />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">קוד שחזור</span>
              <span className="block text-[13px] text-muted-foreground text-pretty">
                {info && !info.hasRecoveryCode ? 'אין קוד בתוקף. כדאי ליצור אחד' : 'בתוקף. כניסה אחת אם אין גישה לאף מכשיר'}
              </span>
            </span>
            <button type="button" onClick={() => setConfirmRecovery(true)} className={cn(TEXT_BUTTON, 'text-primary hover:bg-primary/10')}>
              קוד חדש
            </button>
          </li>
        </ul>
      </section>

      <button type="button" onClick={signOut} className={secondaryButton}>
        <LogOut className="h-4 w-4 -scale-x-100" aria-hidden />
        יציאה
      </button>

      <AppDialog open={!!invite} onOpenChange={o => !o && setInvite(null)} title={invite?.title ?? ''}>
        {invite && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground text-pretty">
              פותחים את הקישור (או סורקים את הקוד) במכשיר החדש. עובד פעם אחת, עד {new Date(invite.expiresAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={invite.qr} alt="קוד QR של קישור ההזמנה" width={240} height={240} className="mx-auto rounded-xl bg-white p-2" />
            <RecoveryCode code={invite.url} link />
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

      <AppDialog open={editingPassword} onOpenChange={o => !o && closePassword()} title="סיסמה">
        <form onSubmit={savePassword} className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground text-pretty">
            לכניסה ממכשיר בלי מפתח: בעמוד הכניסה ← כניסה עם סיסמה, עם השם שלך והסיסמה. לפחות 10 תווים. כניסות אחרות עם סיסמה ייסגרו.
          </p>
          {passwordError && <p className={errorText} role="alert">{passwordError}</p>}
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">סיסמה חדשה</span>
            <input type="password" dir="ltr" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">שוב, לאימות</span>
            <input type="password" dir="ltr" autoComplete="new-password" value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} className={inputClass} />
          </label>
          <button type="submit" disabled={busy || !newPassword || !repeatPassword} className={primaryButton}>שמירה</button>
        </form>
      </AppDialog>

      <ConfirmDialog
        open={removingPassword}
        onOpenChange={setRemovingPassword}
        onConfirm={removePassword}
        busy={busy}
        title="להסיר את הסיסמה?"
        description="אחרי זה אפשר להיכנס רק עם מפתח. כניסות אחרות עם סיסמה ייסגרו."
        confirmLabel="הסרה"
        cancelLabel="השארה"
      />

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
