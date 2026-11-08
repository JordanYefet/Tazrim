'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { secondaryButton } from './ui'

/** A recovery code, shown once: large, selectable, with a copy button. `link` sets a long URL smaller, wrapping anywhere so it stays inside the dialog. */
export function RecoveryCode({ code, link = false }: { code: string; link?: boolean }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      // No clipboard (http, old browser): the code is selectable
    }
  }
  return (
    <div className="space-y-3">
      <p
        dir="ltr"
        className={`select-all break-all rounded-xl bg-muted px-3 py-3 text-center font-mono ${link ? 'text-sm' : 'text-lg font-semibold tracking-wider tabular-nums'}`}
      >
        {code}
      </p>
      <button type="button" onClick={copy} className={secondaryButton}>
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copied ? 'הועתק' : 'העתקה'}
      </button>
    </div>
  )
}
