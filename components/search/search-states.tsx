import { SearchX, Search } from 'lucide-react'

/** Before anything is typed: what can be searched */
export function SearchEmptyState({ compact }: { compact?: boolean }) {
  return (
    <div className={compact ? 'px-4 py-8 text-center' : 'rounded-xl border bg-card px-4 py-12 text-center'}>
      <Search className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
      <p className="mt-3 text-sm font-medium">חיפוש בכל התנועות</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground text-pretty">
        בכל החשבונות והכרטיסים, בכל השנים: שם בית עסק, תיאור, הערה או סכום (למשל ₪120 או 1,200).
      </p>
    </div>
  )
}

export function SearchNoResults({ compact, ignoredHidden }: { compact?: boolean; ignoredHidden?: boolean }) {
  return (
    <div className={compact ? 'px-4 py-8 text-center' : 'rounded-xl border bg-card px-4 py-12 text-center'}>
      <SearchX className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden />
      <p className="mt-3 text-sm font-medium">לא נמצאו תנועות</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground text-pretty">
        נסו מילה אחרת, חלק משם בית העסק או טווח סכומים.
        {ignoredHidden ? ' תנועות מוסתרות אינן נכללות.' : ''}
      </p>
    </div>
  )
}
