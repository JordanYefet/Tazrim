import { notFound } from 'next/navigation'
import { TOKEN_GROUPS } from '@/lib/design/tokens'
import { TokenSwatch } from '@/components/design/token-swatch'
import { ComponentGallery } from '@/components/design/component-gallery'
import { ThemeSelector } from '@/components/layout/theme-selector'

export const metadata = { title: 'מערכת עיצוב · תזרים' }

/** The design system, live (docs/design-system.md). Development only. */
export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <div dir="rtl" className="space-y-10 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">מערכת עיצוב</h1>
          <p className="text-sm text-muted-foreground">
            הטוקנים והרכיבים המשותפים, חיים. התיעוד: <code dir="ltr">docs/design-system.md</code>
          </p>
        </div>
        <ThemeSelector />
      </header>

      {TOKEN_GROUPS.map(group => (
        <section key={group.id} aria-labelledby={`tokens-${group.id}`} className="space-y-4">
          <h2 id={`tokens-${group.id}`} className="text-lg font-semibold">{group.title}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-4">
            {group.tokens.map(token => <TokenSwatch key={token.name} token={token} />)}
          </div>
        </section>
      ))}

      <section aria-labelledby="type" className="space-y-3">
        <h2 id="type" className="text-lg font-semibold">טיפוגרפיה</h2>
        <p className="text-2xl font-semibold tracking-tight">כותרת עמוד · ₪12,480</p>
        <p className="text-lg font-semibold">כותרת אזור</p>
        <p className="text-base font-semibold">כותרת גרף או כרטיס</p>
        <p className="text-sm">טקסט רגיל, עם מספרים <span className="tabular-nums">1,234.56</span></p>
        <p className="text-xs text-muted-foreground">טקסט משני וכיתובים</p>
        <p className="text-4xl sm:text-[2.75rem] font-semibold tracking-tight tabular-nums">₪12,480</p>
      </section>

      <section aria-labelledby="components" className="space-y-4">
        <h2 id="components" className="text-lg font-semibold">רכיבים</h2>
        <ComponentGallery />
      </section>
    </div>
  )
}
