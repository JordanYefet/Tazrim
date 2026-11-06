'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { secondaryButton } from './ui'

/** A recovery code, shown once: large, selectable, with a copy button */
export function RecoveryCode({ code }: { code: string }) {
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
      <p dir="ltr" className="select-all rounded-xl bg-muted px-3 py-3 text-center font-mono text-lg font-semibold tracking-wider tabular-nums">
        {code}
      </p>
      <button type="button" onClick={copy} className={secondaryButton}>
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copied ? 'הועתק' : 'העתקה'}
      </button>
    </div>
  )
}
