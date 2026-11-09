'use client'

import { useEffect, useState } from 'react'
import { Check, KeyRound } from 'lucide-react'
import { secondaryButton } from '@/components/auth/ui'

/** The name the vault's recovery key is saved under in Passwords */
export const VAULT_KEY_NAME = 'מפתח שחזור לכספת'

/** iPhone, iPad and Mac (iPadOS reports itself as a Mac) */
function isApple(): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)
}

/**
 * On Apple devices: "save in Passwords" for the vault's recovery key. The
 * web can't write to Passwords directly, so this is a sign-in form (name +
 * new password, filled in) that is submitted and then goes away: what
 * Safari and Passwords take as "a new password was set here" and offer to
 * save. Nothing is sent anywhere.
 */
export function SaveToPasswords({ secret }: { secret: string }) {
  const [apple, setApple] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => setApple(isApple()), [])
  if (!apple) return null

  if (sent) {
    return (
      <p className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted-foreground text-pretty">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        אם לא הופיעה הצעה לשמור, העתיקו ושמרו ידנית באפליקציית סיסמאות.
      </p>
    )
  }
  return (
    <form
      action="#"
      onSubmit={e => {
        e.preventDefault()
        setSent(true)
      }}
      aria-label="שמירה בסיסמאות"
    >
      {/* Off screen but not hidden: Safari ignores fields with display: none */}
      <div aria-hidden className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
        <input type="text" name="username" autoComplete="username" value={VAULT_KEY_NAME} readOnly tabIndex={-1} />
        <input type="password" name="password" autoComplete="new-password" value={secret} readOnly tabIndex={-1} />
      </div>
      <button type="submit" className={secondaryButton}>
        <KeyRound className="h-4 w-4" aria-hidden />
        שמירה בסיסמאות
      </button>
    </form>
  )
}
