'use client'

import { useRef } from 'react'
import { ProfileEditor } from '@/components/import/profile-editor'
import { AppDialog } from '@/components/ui/app-dialog'
import type { ProfileView } from '@/lib/import/profile-view'

/**
 * Settings → מיפויי ייבוא → עריכת המיפוי (ENG-69): the saved mapping in the column
 * mapper, opened on its stored header, no file needed. The app's window, wide.
 */
export function ProfileEditDialog({
  profile,
  onOpenChange,
  onSaved,
}: {
  profile: ProfileView | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  // Keep the last profile while the window animates out
  const last = useRef(profile)
  if (profile) last.current = profile
  const shown = last.current

  return (
    <AppDialog
      open={!!profile}
      onOpenChange={onOpenChange}
      className="sm:max-w-4xl"
      title={shown && <>עריכת מיפוי: <bdi>{shown.name}</bdi></>}
    >
      {shown && (
        <div className="mt-1 space-y-4">
          {shown.account && <p className="text-xs text-muted-foreground">ברירת מחדל של {shown.account.displayName}</p>}
          <ProfileEditor
            key={shown.id}
            profileId={shown.id}
            onSaved={onSaved}
            onCancel={() => onOpenChange(false)}
            cancelLabel="סגור"
          />
        </div>
      )}
    </AppDialog>
  )
}
