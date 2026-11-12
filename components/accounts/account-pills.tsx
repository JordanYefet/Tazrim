import Link from 'next/link'
import { AccountMini } from '@/components/accounts/account-element'
import { cn } from '@/lib/utils/cn'

/** A filter pill (the account pills, the bank pages' all / income / expenses): opaque, rounded, the picked one tinted */
export function pillClass(on: boolean) {
  return cn(
    'flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] transition-[background-color,color,transform] duration-quick active:scale-[0.97]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'surface',
    on
      ? 'border-primary/45 [background-image:linear-gradient(hsl(var(--primary)/0.1),hsl(var(--primary)/0.1))] font-medium text-primary'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
  )
}

export interface AccountPill {
  key: string
  label: string
  href: string
  /** Draws the account's face before the label; the "all" pills have none */
  account?: { kind: 'BANK' | 'CREDIT_CARD'; provider: string; network?: string | null; color?: string | null }
}

/**
 * Filter by account: one row of pills that scrolls sideways on phones, each
 * account's pill with its face (as the account switcher on /banks and /cards).
 * Used by ניתוח and תחזית, so the two read the same.
 */
export function AccountPills({
  items,
  active,
  label,
  ...rest
}: {
  items: AccountPill[]
  active: string
  label: string
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) {
  return (
    <nav aria-label={label} className="-mx-4 md:mx-0" {...rest}>
      <ul className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-0.5 md:flex-wrap md:overflow-visible md:px-0">
        {items.map(o => {
          const on = o.key === active
          return (
            <li key={o.key} className="shrink-0">
              <Link
                href={o.href}
                scroll={false}
                aria-current={on ? 'page' : undefined}
                className={pillClass(on)}
              >
                {o.account && (
                  <AccountMini
                    kind={o.account.kind}
                    provider={o.account.provider}
                    network={o.account.network}
                    colorChoice={o.account.color}
                    className="w-[22px]"
                  />
                )}
                {o.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
