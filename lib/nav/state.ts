import type { AccountKind } from '@prisma/client'
import { accountPath, type PagedAccountKind } from '@/lib/accounts/routes'
import { seriesColor } from '@/lib/accounts/colors'

/** Cookie holding the sidebar mode, read by the root layout so the first paint is right. */
export const SIDEBAR_COOKIE = 'tazrim_sidebar'
/** Cookie holding the sidebar sections the user folded (comma-separated keys). */
export const SECTIONS_COOKIE = 'tazrim_nav_closed'

export type NavSectionKey = 'banks' | 'cards'
const SECTION_KEYS: NavSectionKey[] = ['banks', 'cards']

export function parseSidebarCollapsed(value: string | undefined): boolean {
  return value === 'collapsed'
}

export function parseClosedSections(value: string | undefined): NavSectionKey[] {
  const parts = new Set((value ?? '').split(','))
  return SECTION_KEYS.filter(k => parts.has(k))
}

export function serializeClosedSections(keys: NavSectionKey[]): string {
  return SECTION_KEYS.filter(k => keys.includes(k)).join(',')
}

export function toggleSection(closed: NavSectionKey[], key: NavSectionKey): NavSectionKey[] {
  return closed.includes(key) ? closed.filter(k => k !== key) : [...closed, key]
}

/** A `document.cookie` assignment: whole site, one year. */
export function cookieAssignment(name: string, value: string): string {
  return `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
}

const SECTION_PATH: Record<PagedAccountKind, string> = { BANK: '/banks', CREDIT_CARD: '/cards' }

/** The (decoded) account id when the path is that kind's account page, else null. */
export function routeAccountId(pathname: string, kind: PagedAccountKind): string | null {
  const prefix = `${SECTION_PATH[kind]}/`
  if (!pathname.startsWith(prefix)) return null
  const rest = pathname.slice(prefix.length)
  if (!rest || rest.includes('/')) return null
  try {
    return decodeURIComponent(rest)
  } catch {
    return rest
  }
}

/** Pages reached from the phone's "עוד" sheet. */
const MORE_PATHS = ['/upload', '/categories', '/settings', '/accounts', '/about']

export function isMoreActive(pathname: string): boolean {
  return MORE_PATHS.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export interface NavAccount {
  id: string
  name: string
  lastFour: string | null
  /** Provider key and card network, for the account element's face (ENG-56/57) */
  provider: string
  cardNetwork: string | null
  href: string
  /** Dot color: the account's chosen colour (ENG-66), else its position's; cards match the /cards overview chart */
  color: string
  /** Account.color (ENG-66), for the account element's face */
  colorChoice: string | null
}

export interface NavSections {
  banks: NavAccount[]
  cards: NavAccount[]
}

// Same order as CARD_COLORS on /cards, so a card's dot matches its chart series
export const CARD_COLORS = ['var(--chart-cc)', 'var(--chart-1)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-8)', 'var(--chart-9)']
export const BANK_COLORS = ['var(--chart-income)', 'var(--chart-10)', 'var(--chart-6)', 'var(--chart-9)']

interface AccountLike {
  id: string
  kind: AccountKind
  displayName: string
  cardLastFour: string | null
  provider?: string
  cardNetwork?: string | null
  color?: string | null
}

/** Banks and cards for the nav, in the order given (oldest first from listAccounts). */
export function buildNavSections(accounts: AccountLike[]): NavSections {
  const pick = (kind: PagedAccountKind, colors: string[]) =>
    accounts
      .filter(a => a.kind === kind)
      .map((a, i) => ({
        id: a.id,
        name: a.displayName,
        lastFour: a.cardLastFour,
        provider: a.provider ?? '',
        cardNetwork: a.cardNetwork ?? null,
        href: accountPath(kind, a.id),
        color: seriesColor(a.color, colors[i % colors.length]),
        colorChoice: a.color ?? null,
      }))
  return { banks: pick('BANK', BANK_COLORS), cards: pick('CREDIT_CARD', CARD_COLORS) }
}
