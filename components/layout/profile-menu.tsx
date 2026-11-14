'use client'

import { createContext, useContext } from 'react'
import { PersonAvatar } from '@/components/avatar/person-avatar'
import type { Avatar as AvatarData } from '@/lib/avatar/options'

/** The signed-in person (ENG-89): their name and how this browser signed in; null with the login off */
export interface Me {
  name: string
  /** The passkey's device label, or null when this browser signed in with a password or the recovery code */
  device: string | null
  /** Their chosen avatar (Settings → People), null until they pick one */
  avatar: AvatarData | null
}

const MeContext = createContext<Me | null>(null)

/** Null with the login off: the profile card then has no person rows */
export function useMe() {
  return useContext(MeContext)
}

export function MeProvider({ me, children }: { me: Me | null; children: React.ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>
}

export const signedInWith = (me: Me) => (me.device ? `מפתח ב-${me.device}` : 'סיסמה')

export async function signOut() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  window.location.assign('/login')
}

export function Avatar({ me, size }: { me: Me; size: number }) {
  return <PersonAvatar avatar={me.avatar} name={me.name} size={size} />
}

export const MENU_ITEM =
  'flex h-10 cursor-pointer select-none items-center gap-3 rounded-lg px-2.5 text-sm outline-none transition-colors data-[highlighted]:bg-muted'
