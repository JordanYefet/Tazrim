export type FaceTone = 'idle' | 'busy' | 'attention' | 'done' | 'failed'

/** What the avatar wears for the sync's tone: a turning ring, or a small badge in the corner */
export type AvatarMark = 'none' | 'ring' | 'code' | 'alert' | 'done' | 'failed'

export function avatarMark(tone: FaceTone, needsCode: boolean): AvatarMark {
  if (tone === 'busy') return 'ring'
  if (tone === 'attention') return needsCode ? 'code' : 'alert'
  if (tone === 'done') return 'done'
  if (tone === 'failed') return 'failed'
  return 'none'
}

export type ProfileRow = 'who' | 'sync' | 'upload' | 'settings' | 'signout'

/**
 * The card's rows in order: the person's own rows only with someone signed in. "who" opens
 * People and devices, so that has no row of its own; signing out sits alone below the line.
 */
export function profileRows(signedIn: boolean): ProfileRow[] {
  return signedIn ? ['who', 'sync', 'upload', 'settings', 'signout'] : ['sync', 'upload', 'settings']
}
