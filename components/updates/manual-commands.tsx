'use client'

import { useState } from 'react'

/** The one command that updates an install by hand (ENG-98); Docker words stay behind "הצגת פקודות ידניות" */
export const MANUAL_COMMAND = 'docker compose pull && docker compose up -d'

const TEXT_BUTTON =
  'inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary transition-colors duration-quick hover:bg-primary/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** The command, selectable, with a copy button */
export function ManualCommandsPanel() {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(MANUAL_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard (plain http): the command is selectable
    }
  }
  return (
    <div className="mt-1 space-y-2 rounded-xl bg-muted p-3">
      <p className="text-sm text-muted-foreground">בתיקייה של תזרים במחשב שעליו הוא רץ:</p>
      <p dir="ltr" className="select-all break-words font-mono text-sm">
        {MANUAL_COMMAND}
      </p>
      <button type="button" onClick={copy} className={TEXT_BUTTON}>
        {copied ? 'הועתק' : 'העתקה'}
      </button>
    </div>
  )
}

/** "הצגת פקודות ידניות": a real button that opens the command under it */
export function ManualCommands({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} className={`${TEXT_BUTTON} -ms-3`}>
        הצגת פקודות ידניות
      </button>
      {open && <ManualCommandsPanel />}
    </div>
  )
}
