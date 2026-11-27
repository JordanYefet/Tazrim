import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/client'
import { isResponse, sessionOr401 } from '@/lib/vault/http'
import { listCredentials, status } from '@/lib/vault/vault'
import { logged } from '@/lib/log/route'

export const dynamic = 'force-dynamic'

/**
 * GET: the vault (ENG-90) for Settings: whether it exists and is open, which
 * passkeys have their own copy, and the stored sign-ins without any secret.
 */
async function handleGET() {
  const session = await sessionOr401()
  if (isResponse(session)) return session
  const [vault, credentials, passkeys, me] = await Promise.all([
    status(),
    listCredentials(),
    prisma.passkey.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, label: true, personId: true, person: { select: { name: true } } },
    }),
    prisma.person.findUnique({ where: { id: session.personId }, select: { passwordHash: true, vaultPasswordOff: true } }),
  ])
  return NextResponse.json({
    vault: { ...vault, passkeys: undefined, passwords: undefined, waiting: undefined },
    /** The signed-in person's password: whether they have one, and whether it opens the vault (ENG-135), and whether they turned it off (ENG-139) */
    password: { has: !!me?.passwordHash, opensVault: vault.passwords.includes(session.personId), optedOut: !!me?.vaultPasswordOff },
    credentials,
    /** The signed-in person's level, for what is for admins (ENG-140) */
    isAdmin: session.role === 'admin',
    passkeys: passkeys.map(p => ({
      id: p.id,
      label: p.label,
      personName: p.person.name,
      mine: p.personId === session.personId,
      thisDevice: p.id === session.passkeyId,
      opens: vault.passkeys.includes(p.id),
      /** No copy yet, but it has registered: the next opening leaves it one (ENG-140) */
      waiting: vault.waiting.includes(p.id),
    })),
  })
}

export const GET = logged(handleGET)
