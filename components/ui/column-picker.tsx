'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, Columns3 } from 'lucide-react'
import { cookieAssignment } from '@/lib/nav/state'
import { columnsCookie, columnsFor, formatColumns, type TableKind } from '@/lib/tables/columns'

/**
 * "עמודות": which optional columns a transaction table shows (lib/tables/columns.ts).
 * The choice is saved in a cookie, so every table of that kind shows the same ones.
 */
export function ColumnPicker({
  kind,
  shown,
  onChange,
}: {
  kind: TableKind
  shown: string[]
  onChange: (next: string[]) => void
}) {
  const columns = columnsFor(kind)

  function toggle(key: string, on: boolean) {
    const next = columns.map(c => c.key).filter(k => (k === key ? on : shown.includes(k)))
    document.cookie = cookieAssignment(columnsCookie(kind), formatColumns(next))
    onChange(next)
  }

  return (
    <DropdownMenu.Root dir="rtl">
      <DropdownMenu.Trigger
        className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
      >
        <Columns3 className="h-3.5 w-3.5" aria-hidden />
        עמודות
        {shown.length > 0 && <span className="tabular-nums text-xs text-primary">({shown.length})</span>}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-xl surface-overlay p-1 text-sm text-card-foreground shadow-e2"
        >
          <DropdownMenu.Label className="px-2.5 pb-1 pt-1.5 text-xs text-muted-foreground">עמודות נוספות בטבלה</DropdownMenu.Label>
          {columns.map(c => (
            <DropdownMenu.CheckboxItem
              key={c.key}
              checked={shown.includes(c.key)}
              // keep the menu open, so several can be ticked in a row
              onSelect={e => e.preventDefault()}
              onCheckedChange={on => toggle(c.key, on === true)}
              className="flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-muted"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded border border-border data-[state=checked]:border-primary">
                <DropdownMenu.ItemIndicator>
                  <Check className="h-3 w-3 text-primary" aria-hidden />
                </DropdownMenu.ItemIndicator>
              </span>
              {c.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
