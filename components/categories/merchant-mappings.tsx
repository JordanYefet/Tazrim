'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { providerLabel } from '@/lib/accounts/brands'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { AppDialog } from '@/components/ui/app-dialog'
import { CategoryPicker, CategoryPill } from './category-picker'

interface Alias {
  id: string
  provider: string
  originalName: string
  displayName: string
  categoryOverride: string | null
}

interface Category { id: string; name: string }

/**
 * Merchant rules (a display name, and a category for every charge of the merchant):
 * a row per merchant. Its name opens a window to rename it or delete the rule; its
 * category pill opens the category window, as in the tables.
 */
export function MerchantMappings({ initial, categories, colors = {} }: {
  initial: Alias[]
  categories: Category[]
  /** Each category's chart colour */
  colors?: Record<string, string>
}) {
  const [aliases, setAliases] = useState(initial)
  const [renaming, setRenaming] = useState<Alias | null>(null)
  const [picking, setPicking] = useState<Alias | null>(null)
  // The last row stays while each window animates out
  const [lastRenamed, setLastRenamed] = useState<Alias | null>(null)
  const [lastPicked, setLastPicked] = useState<Alias | null>(null)
  if (renaming && renaming !== lastRenamed) setLastRenamed(renaming)
  if (picking && picking !== lastPicked) setLastPicked(picking)
  const { confirm, dialog } = useConfirm()

  async function patch(alias: Alias, change: Partial<Pick<Alias, 'displayName' | 'categoryOverride'>>) {
    const next = { ...alias, ...change }
    await fetch('/api/aliases', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: next.provider,
        originalName: next.originalName,
        displayName: next.displayName,
        categoryOverride: next.categoryOverride,
      }),
    })
    setAliases(prev => prev.map(a => (a.id === alias.id ? next : a)))
  }

  async function deleteAliasRow(alias: Alias) {
    const ok = await confirm({
      title: <>למחוק את המיפוי של <bdi>{alias.originalName}</bdi>?</>,
      description: 'הכלל לא יחול על קבצים שיועלו מעכשיו. תנועות שכבר עודכנו לפיו לא ישתנו.',
    })
    if (!ok) return
    setRenaming(null)
    await fetch(`/api/aliases/${alias.id}`, { method: 'DELETE' })
    setAliases(prev => prev.filter(a => a.id !== alias.id))
  }

  if (!aliases.length) {
    return (
      <>
        <div className="text-center py-10 text-muted-foreground text-sm">
          לא קיימים מיפויים עדיין. העלה קבצים כדי להתחיל.
        </div>
        {dialog}
      </>
    )
  }

  return (
    <>
      <ul className="overflow-hidden rounded-xl bg-muted/40 divide-y divide-border/60">
        {aliases.map(alias => (
          <li key={alias.id} className="flex min-h-[56px] items-center gap-2 pe-3.5">
            <button
              onClick={() => setRenaming(alias)}
              className="flex min-w-0 flex-1 items-center gap-2 py-2 ps-3.5 text-start transition-colors hover:bg-muted/60"
            >
              <span className="min-w-0 flex-1">
                <bdi className="block truncate text-[15px] font-medium">{alias.displayName}</bdi>
                <span className="block truncate text-xs text-muted-foreground">
                  {alias.originalName !== alias.displayName && <><bdi>{alias.originalName}</bdi> · </>}
                  {providerLabel(alias.provider)}
                </span>
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
            </button>
            <CategoryPill
              name={alias.categoryOverride}
              color={alias.categoryOverride ? colors[alias.categoryOverride] : undefined}
              onClick={() => setPicking(alias)}
            />
          </li>
        ))}
      </ul>

      <RenameWindow
        alias={renaming ?? lastRenamed}
        open={!!renaming}
        onClose={() => setRenaming(null)}
        onSave={async name => {
          if (!renaming) return
          setRenaming(null)
          await patch(renaming, { displayName: name })
        }}
        onDelete={() => renaming && deleteAliasRow(renaming)}
      />

      <CategoryPicker
        open={!!picking}
        onOpenChange={o => !o && setPicking(null)}
        context={lastPicked ? `בית עסק · ${providerLabel(lastPicked.provider)}` : ''}
        title={lastPicked?.displayName ?? ''}
        amount=""
        amountTone="expense"
        categories={categories.map(c => ({ name: c.name, color: colors[c.name] }))}
        createKind="EXPENSE"
        current={lastPicked?.categoryOverride ?? null}
        allowNone
        note="הקטגוריה חלה על החיובים הבאים מבית העסק, בכל הכרטיסים של החברה."
        onSave={async category => {
          if (!picking) return
          setPicking(null)
          await patch(picking, { categoryOverride: category })
        }}
      />
      {dialog}
    </>
  )
}

/** A merchant's window: its display name, and deleting the rule */
function RenameWindow({ alias, open, onClose, onSave, onDelete }: {
  alias: Alias | null
  open: boolean
  onClose: () => void
  onSave: (name: string) => void
  onDelete: () => void
}) {
  return (
    <AppDialog open={open} onOpenChange={o => !o && onClose()} title={<bdi>{alias?.displayName}</bdi>}>
      {/* Remounted per opening, so the field starts from the current name */}
      {open && alias && <RenameForm key={alias.id} alias={alias} onSave={onSave} onDelete={onDelete} />}
    </AppDialog>
  )
}

function RenameForm({ alias, onSave, onDelete }: { alias: Alias; onSave: (name: string) => void; onDelete: () => void }) {
  const [name, setName] = useState(alias.displayName)
  const changed = name.trim() !== '' && name.trim() !== alias.displayName
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        בקובץ: <bdi className="text-foreground">{alias.originalName}</bdi> · {providerLabel(alias.provider)}
      </p>
      <label className="block space-y-1.5">
        <span className="text-sm text-muted-foreground">שם מוצג</span>
        <input
          autoFocus
          className="h-11 w-full rounded-xl border bg-background px-3.5 text-base focus:outline-none focus:ring-2 focus:ring-ring"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && changed) onSave(name.trim()) }}
        />
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => onSave(name.trim())}
          disabled={!changed}
          className="h-11 flex-1 rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-[opacity,transform] active:scale-[0.97] disabled:opacity-40"
        >
          שמירה
        </button>
        <button
          onClick={onDelete}
          className="h-11 flex-1 rounded-xl bg-destructive/10 text-[15px] text-destructive transition-[background-color,transform] hover:bg-destructive/15 active:scale-[0.97]"
        >
          מחיקת המיפוי
        </button>
      </div>
    </div>
  )
}
