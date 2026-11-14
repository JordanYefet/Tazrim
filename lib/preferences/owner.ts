import { isAuthRequired } from '@/lib/auth/config'
import { currentSession } from '@/lib/auth/http'
import { isReadOnly } from '@/lib/read-only'

/**
 * Whose preferences this request reads and writes: the signed-in person's id, null for the
 * household when the login is off, or undefined when there is nowhere to keep them (the
 * read-only demo, or no session).
 */
export async function preferenceOwner(): Promise<string | null | undefined> {
  if (isReadOnly()) return undefined
  if (!isAuthRequired()) return null
  const session = await currentSession()
  return session ? session.personId : undefined
}
