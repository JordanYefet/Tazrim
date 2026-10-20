import { Suspense } from 'react'
import Link from 'next/link'
import { ChevronRight, Settings2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { settingsAccountsHref } from '@/lib/accounts/routes'
import { AccountSwitcher } from './account-switcher'
import { CardTransitionLink } from '@/components/cards/card-transition'

/**
 * Period label above the title, like the dashboard ("מרץ 2026" / "כל החודשים · 2026").
 * On /banks* and /cards* phones also get account pills under it.
 */
export function PageHeading({
  period,
  title,
  back,
  badge,
  children,
}: {
  period: string
  title: string
  /** Link up to the overview, shown above the period */
  back?: { href: string; label: string }
  badge?: string
  /** Actions at the end of the row */
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          {back && (
            <CardTransitionLink
              transition={back.href.startsWith('/cards')}
              href={back.href}
              className="mb-1 inline-flex items-center gap-0.5 rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
              {back.label}
            </CardTransitionLink>
          )}
          <p className="text-sm font-medium text-muted-foreground">{period}</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {badge && (
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{badge}</span>
            )}
          </div>
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
      <Suspense fallback={null}>
        <AccountSwitcher />
      </Suspense>
    </div>
  )
}

/** Small "ניהול חשבונות" link to the accounts section of /settings. */
export function ManageAccountsLink() {
  return (
    <Link
      href={settingsAccountsHref({})}
      className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Settings2 className="h-4 w-4" aria-hidden />
      ניהול חשבונות
    </Link>
  )
}

export interface LegendItem {
  label: string
  /** Any CSS color; use a CSS var so server and client markup match */
  color: string
}

/** The dashboard's chart header: title and subtitle, legend at the end. */
export function ChartHeader({
  title,
  subtitle,
  legend,
  className,
}: {
  title: string
  subtitle?: string
  legend?: LegendItem[]
  className?: string
}) {
  return (
    <div className={cn('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-2', className)}>
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {legend && legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map(item => (
            <li key={item.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Card surface used by every chart and list on these pages. */
export const SECTION = 'rounded-xl surface p-4 sm:p-6'

export function EmptyState({
  icon: Icon,
  title,
  text,
  actions,
}: {
  icon: LucideIcon
  title: string
  text: string
  actions?: { href: string; label: string; icon?: LucideIcon; primary?: boolean }[]
}) {
  return (
    <section className="rounded-xl surface border-dashed px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground text-pretty">{text}</p>
      {actions && actions.length > 0 && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {actions.map(({ href, label, icon: ActionIcon, primary }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-[background-color,transform] duration-200 active:scale-[0.98]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                primary
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'border bg-card text-foreground hover:bg-muted'
              )}
            >
              {ActionIcon && <ActionIcon className="h-4 w-4" aria-hidden />}
              {label}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
