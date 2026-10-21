'use client'

import { useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { ProfileEditor } from '@/components/import/profile-editor'
import type { ProfileView } from '@/lib/import/profile-view'

/**
 * Settings → מיפויי ייבוא → ערוך (ENG-69): the saved mapping in the column
 * mapper, opened on its stored header, no file needed. Same window as the
 * account edit window: a sheet from the bottom on phones, centred on wider screens.
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
    <Dialog.Root open={!!profile} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-scrim fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          dir="rtl"
          aria-describedby={undefined}
          className="confirm-dialog fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl surface-overlay p-5 text-card-foreground focus:outline-none sm:inset-x-4 sm:inset-y-0 sm:my-auto sm:h-fit sm:max-h-[88dvh] sm:max-w-4xl sm:rounded-3xl sm:p-6"
        >
          {shown && (
            <div className="space-y-4">
              <Dialog.Close
                aria-label="סגור"
                className="absolute end-3 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden />
              </Dialog.Close>
              <div className="pe-10">
                <Dialog.Title className="text-base font-semibold">
                  עריכת מיפוי: <bdi>{shown.name}</bdi>
                </Dialog.Title>
                {shown.account && (
                  <p className="text-xs text-muted-foreground">ברירת מחדל של {shown.account.displayName}</p>
                )}
              </div>
              <ProfileEditor
                key={shown.id}
                profileId={shown.id}
                onSaved={onSaved}
                onCancel={() => onOpenChange(false)}
                cancelLabel="סגור"
              />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
