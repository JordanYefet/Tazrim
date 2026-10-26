'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

/**
 * The last chip of a chip list: "+ <label>" that turns into a field in place.
 * Enter adds (and keeps the field open for the next one), Escape or leaving it empty closes it.
 * `onAdd` resolves to whether the value was added, so a refused one stays in the field.
 */
export function AddChip({ label, placeholder, onAdd }: {
  label: string
  placeholder: string
  onAdd: (value: string) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')

  async function submit() {
    if (!value.trim()) return
    if (await onAdd(value.trim())) setValue('')
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm text-primary transition-colors hover:border-primary/50 hover:bg-primary/5"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
        {label}
      </button>
    )
  }
  return (
    <input
      autoFocus
      aria-label={placeholder}
      placeholder={placeholder}
      className="w-48 rounded-full border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') submit()
        if (e.key === 'Escape') { setValue(''); setOpen(false) }
      }}
      onBlur={() => { if (!value.trim()) setOpen(false) }}
    />
  )
}
