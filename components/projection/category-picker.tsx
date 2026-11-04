'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown } from 'lucide-react'

const ITEM = 'group flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-1.5 outline-none transition-colors data-[highlighted]:bg-muted'

/** The check box of a menu row: ticking fills it and pops the check in (as in ColumnPicker) */
function Box() {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border transition-[background-color,border-color] duration-fast ease-ui group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary/10">
      <DropdownMenu.ItemIndicator
        forceMount
        className="flex transition-[opacity,transform] duration-fast ease-ui data-[state=unchecked]:scale-50 data-[state=unchecked]:opacity-0 motion-reduce:transition-none"
      >
        <Check className="h-3 w-3 text-primary" aria-hidden />
      </DropdownMenu.ItemIndicator>
    </span>
  )
}

/**
 * Which categories the lines show: a pill that opens a list to tick one, several, or all of
 * them ("הכל" ticks every one, or clears them when all are ticked). The menu stays open while ticking.
 */
export function CategoryPicker({ names, colors, shown, onChange }: {
  names: string[]
  colors: Record<string, string>
  shown: string[]
  onChange: (next: string[]) => void
}) {
  const all = names.length > 0 && names.every(n => shown.includes(n))
  const set = (name: string, on: boolean) => onChange(names.filter(n => (n === name ? on : shown.includes(n))))
  return (
    <DropdownMenu.Root dir="rtl">
      <DropdownMenu.Trigger className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-sm text-muted-foreground ring-1 ring-inset ring-border transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted data-[state=open]:text-foreground">
        קטגוריות
        <span className="tabular-nums text-xs text-primary">
          ({all ? 'הכל' : shown.length})
        </span>
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="menu-panel z-50 max-h-80 min-w-52 overflow-y-auto rounded-xl surface-overlay p-1 text-sm text-card-foreground shadow-e2"
        >
          <DropdownMenu.CheckboxItem
            checked={all}
            onSelect={e => e.preventDefault()}
            onCheckedChange={on => onChange(on === true ? [...names] : [])}
            className={ITEM}
          >
            <Box />
            הכל
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          {names.map(name => (
            <DropdownMenu.CheckboxItem
              key={name}
              checked={shown.includes(name)}
              // keep the menu open, so several can be ticked in a row
              onSelect={e => e.preventDefault()}
              onCheckedChange={on => set(name, on === true)}
              className={ITEM}
            >
              <Box />
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colors[name] }} aria-hidden />
              <bdi>{name}</bdi>
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
