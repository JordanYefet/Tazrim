'use client'

import { createContext, useContext } from 'react'
import {
  Building2,
  CreditCard,
  LayoutDashboard,
  Info,
  Repeat,
  Settings,
  Tag,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import type { PagedAccountKind } from '@/lib/accounts/routes'
import type { NavAccount, NavSectionKey, NavSections } from '@/lib/nav/state'

const NavSectionsContext = createContext<NavSections>({ banks: [], cards: [] })

/** The non-archived banks and cards, loaded once by the root layout. */
export function NavSectionsProvider({ sections, children }: { sections: NavSections; children: React.ReactNode }) {
  return <NavSectionsContext.Provider value={sections}>{children}</NavSectionsContext.Provider>
}

export function useNavSections(): NavSections {
  return useContext(NavSectionsContext)
}

export interface NavLinkItem {
  type: 'link'
  href: string
  label: string
  icon: LucideIcon
}

export interface NavSectionItem {
  type: 'section'
  key: NavSectionKey
  kind: PagedAccountKind
  href: string
  label: string
  /** First entry of the flyout and the phone pills */
  allLabel: string
  icon: LucideIcon
}

export type NavItem = NavLinkItem | NavSectionItem

export const SECTION_ITEMS: Record<NavSectionKey, NavSectionItem> = {
  banks: { type: 'section', key: 'banks', kind: 'BANK', href: '/banks', label: 'בנקים', allLabel: 'כל הבנקים', icon: Building2 },
  cards: {
    type: 'section',
    key: 'cards',
    kind: 'CREDIT_CARD',
    href: '/cards',
    label: 'כרטיסי אשראי',
    allLabel: 'כל הכרטיסים',
    icon: CreditCard,
  },
}

export const MAIN_NAV: NavItem[] = [
  { type: 'link', href: '/', label: 'לוח בקרה', icon: LayoutDashboard },
  SECTION_ITEMS.banks,
  SECTION_ITEMS.cards,
  { type: 'link', href: '/recurring', label: 'חיובים קבועים', icon: Repeat },
  { type: 'link', href: '/upload', label: 'העלאת קבצים', icon: Upload },
  { type: 'link', href: '/categories', label: 'קטגוריות', icon: Tag },
]

export const SETTINGS_NAV: NavLinkItem = { type: 'link', href: '/settings', label: 'הגדרות', icon: Settings }
export const ABOUT_NAV: NavLinkItem = { type: 'link', href: '/about', label: 'אודות', icon: Info }

export type { NavAccount }
