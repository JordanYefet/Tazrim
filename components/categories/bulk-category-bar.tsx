'use client'

import { useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { CategoryPicker, type PickerCategory } from './category-picker'

/**
 * The bar over a table (or search results) with rows ticked: how many, "בחר
 * קטגוריה" (one window for all of them, each row gets it as its own choice)
 * and clearing the selection. Bank, card and search rows share it.
 */
export function BulkCategoryBar({
  count,
  kind,
  context,
  amount = '',
  categories,
  allowNone,
  extra,
  onApply,
  onClear,
}: {
  count: number
  /** Which categories fit: 'mixed' (money in with money out) offers none */
  kind: 'expense' | 'income' | 'mixed'
  /** The window's heading line, e.g. "חיובים בכרטיס" */
  context: string
  /** The rows' total, when known */
  amount?: string
  categories: PickerCategory[]
  /** "ללא קטגוריה" in the window (bank rows only: a card charge always shows one) */
  allowNone?: boolean
  /** More controls after the count (search's "select every match") */
  extra?: ReactNode
  onApply: (category: string | null) => Promise<void>
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const income = kind === 'income'

  return (
    <div className="sticky top-16 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl surface-overlay px-3 py-2 text-sm">
      <span className="font-medium">
        {count === 1 ? 'נבחרה תנועה אחת' : <>נבחרו <span className="tabular-nums">{count}</span> תנועות</>}
      </span>
      {extra}
      {kind === 'mixed' ? (
        <span className="text-xs text-muted-foreground">בחרו תנועות מאותו כיוון</span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-[background-color,transform] hover:bg-primary/90 active:scale-[0.97]"
        >
          בחר קטגוריה
        </button>
      )}
      <button
        onClick={onClear}
        className="ms-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-3 w-3" />
        ניקוי הבחירה
      </button>

      <CategoryPicker
        open={open}
        onOpenChange={setOpen}
        context={context}
        title={count === 1 ? 'תנועה אחת' : `${count} תנועות`}
        amount={amount}
        amountTone={income ? 'income' : 'expense'}
        categories={categories}
        createKind={income ? 'INCOME' : 'EXPENSE'}
        current={undefined}
        allowNone={allowNone}
        note="כל תנועה שנבחרה תקבל את הקטגוריה הזאת, כבחירה שלה בלבד."
        onSave={async category => {
          setOpen(false)
          await onApply(category)
        }}
      />
    </div>
  )
}
