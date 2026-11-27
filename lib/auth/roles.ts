/**
 * Permission levels (ENG-140). A person is an "admin" or a "member". Members have the household's
 * money (viewing, categories, uploads, accounts, the sync, the vault's use) and their own sign-in;
 * admins also manage people and devices, updates, the network, isolation, the recovery code, the
 * vault's reset and deleting all data. The owner (who installed it) is always an admin, and can't
 * be demoted or removed, by anyone, themself included.
 */
import { prisma } from '@/lib/db/client'

export const ROLES = ['admin', 'member'] as const
export type Role = (typeof ROLES)[number]

export const isRole = (v: unknown): v is Role => ROLES.includes(v as Role)

/** What a stored role string means; anything unknown is the lower level */
export const toRole = (v: unknown): Role => (v === 'admin' ? 'admin' : 'member')

export type SetRoleResult = 'ok' | 'not-found' | 'owner-locked'

/** Changes a person's level. The owner stays an admin: refused with OWNER_LOCKED, whoever asks. */
export async function setRole(personId: string, role: Role): Promise<SetRoleResult> {
  return prisma.$transaction(async tx => {
    const person = await tx.person.findUnique({ where: { id: personId }, select: { owner: true } })
    if (!person) return 'not-found'
    if (person.owner && role !== 'admin') return 'owner-locked'
    await tx.person.update({ where: { id: personId }, data: { role } })
    return 'ok'
  })
}

export type RemovePersonResult = 'ok' | 'not-found' | 'owner-locked'

/** Removes a person with their devices, sessions and choices (the household's data is not theirs). Never the owner. */
export async function removePerson(personId: string): Promise<RemovePersonResult> {
  return prisma.$transaction(async tx => {
    const person = await tx.person.findUnique({ where: { id: personId }, select: { owner: true } })
    if (!person) return 'not-found'
    if (person.owner) return 'owner-locked'
    await tx.person.delete({ where: { id: personId } })
    return 'ok'
  })
}

export const OWNER_LOCKED_MESSAGE = 'מי שהתקין/ה את תזרים הוא/היא תמיד מנהל/ת, ואי אפשר להוריד או להסיר'
