import Link from 'next/link'
import { ChevronLeft, CreditCard, FileText, Palette, TrendingUp, TriangleAlert, Users, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export interface SettingsTile {
  href: string
  title: string
  summary: string
  icon: 'appearance' | 'projection' | 'accounts' | 'import-profiles' | 'people'
}

const ICONS: Record<SettingsTile['icon'], LucideIcon> = {
  appearance: Palette,
  projection: TrendingUp,
  accounts: CreditCard,
  'import-profiles': FileText,
  people: Users,
}

/**
 * The Settings home: a tile per section, each opening its own page. Rows split
 * evenly: five tiles are thirds then halves, four are halves. The danger zone
 * is a quiet link under them, apart from the everyday sections.
 */
export function SettingsTiles({ tiles }: { tiles: SettingsTile[] }) {
  const thirds = tiles.length % 2 === 1 ? 3 : 0
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        {tiles.map((t, i) => {
          const Icon = ICONS[t.icon]
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'group flex flex-col gap-3.5 rounded-2xl surface p-5 transition-[transform,box-shadow] duration-fast ease-ui hover:-translate-y-0.5 hover:shadow-e2 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0',
                i < thirds ? 'md:col-span-2' : 'md:col-span-3'
              )}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-[22px] w-[22px]" aria-hidden />
                </span>
                <ChevronLeft className="h-[18px] w-[18px] text-muted-foreground/70 transition-transform duration-fast ease-ui group-hover:-translate-x-0.5 motion-reduce:transition-none" aria-hidden />
              </span>
              <span className="space-y-1">
                <span className="block text-[17px] font-semibold">{t.title}</span>
                <span className="block text-sm leading-relaxed text-muted-foreground text-pretty">{t.summary}</span>
              </span>
            </Link>
          )
        })}
      </div>
      <Link
        href="/settings/danger"
        className="inline-flex min-h-11 items-center gap-2.5 rounded-xl px-4 text-[15px] font-medium text-destructive transition-colors duration-quick hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 dark:text-red-400"
      >
        <TriangleAlert className="h-[18px] w-[18px]" aria-hidden />
        אזור מסוכן: מחיקת כל הנתונים
      </Link>
    </div>
  )
}
