/**
 * Permission levels (ENG-140): the migration's default (the earliest person is the owner and an
 * admin), the owner that can't be demoted or removed, and a role changed by admins only. Fake values only.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, releasePrisma, usePrismaOn, type TestDb } from '@/lib/db/__tests__/test-db'

const MIGRATION = '20261127000000_person_roles'

describe('the migration', () => {
  it('makes the earliest-created person the owner and an admin, and everyone else a member', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`
        INSERT INTO "Person" ("id","name","createdAt") VALUES ('p-b','Second',1900000002000);
        INSERT INTO "Person" ("id","name","createdAt") VALUES ('p-a','First',1900000001000);
        INSERT INTO "Person" ("id","name","createdAt") VALUES ('p-c','Third',1900000003000);
      `)
      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT "id","role","owner" FROM "Person" ORDER BY "createdAt"`)).toEqual([
        { id: 'p-a', role: 'admin', owner: 1 },
        { id: 'p-b', role: 'member', owner: 0 },
        { id: 'p-c', role: 'member', owner: 0 },
      ])
    } finally {
      db.cleanup()
    }
  })

  it('breaks a tie on the creation time by id, and an empty household stays empty', () => {
    const db = createTestDb({ before: MIGRATION })
    try {
      db.exec(`
        INSERT INTO "Person" ("id","name","createdAt") VALUES ('p-2','B',1900000001000);
        INSERT INTO "Person" ("id","name","createdAt") VALUES ('p-1','A',1900000001000);
      `)
      db.applyMigration(MIGRATION)
      expect(db.query(`SELECT "id" FROM "Person" WHERE "owner" = 1`)).toEqual([{ id: 'p-1' }])
    } finally {
      db.cleanup()
    }
    const empty = createTestDb({ before: MIGRATION })
    try {
      empty.applyMigration(MIGRATION)
      expect(empty.query(`SELECT COUNT(*) AS n FROM "Person"`)).toEqual([{ n: 0 }])
    } finally {
      empty.cleanup()
    }
  })

  it('new people default to member, and the down file removes the columns', () => {
    const db = createTestDb()
    try {
      db.exec(`INSERT INTO "Person" ("id","name") VALUES ('p1','New')`)
      expect(db.query(`SELECT "role","owner" FROM "Person"`)).toEqual([{ role: 'member', owner: 0 }])
      db.applyDown(MIGRATION)
      expect(db.query(`SELECT name FROM pragma_table_info('Person')`).map(c => (c as { name: string }).name)).not.toContain('role')
    } finally {
      db.cleanup()
    }
  })
})

describe('owner and levels', () => {
  let db: TestDb
  beforeAll(() => {
    db = createTestDb()
    usePrismaOn(db)
  })
  afterAll(async () => {
    await releasePrisma()
    db.cleanup()
  })

  it('the first person is created as the owner and an admin; an invited person as a member', async () => {
    const { createFirstPerson, joinWithPassword, createInvite } = await import('../household')
    const { prisma } = await import('@/lib/db/client')
    const first = await createFirstPerson('Owner', 'fake password one')
    expect(first).not.toBe('already-set-up')
    const { token } = await createInvite(null)
    const invite = await prisma.invite.findFirstOrThrow()
    expect(token).toBeTruthy()
    const joined = await joinWithPassword(invite.id, 'Guest', 'fake password two')
    expect(joined).toHaveProperty('id')
    expect(await prisma.person.findMany({ orderBy: { createdAt: 'asc' }, select: { name: true, role: true, owner: true } })).toEqual([
      { name: 'Owner', role: 'admin', owner: true },
      { name: 'Guest', role: 'member', owner: false },
    ])
  })

  it('an admin can set another person to admin and back; the owner can never be lowered or removed', async () => {
    const { setRole, removePerson } = await import('../roles')
    const { prisma } = await import('@/lib/db/client')
    const owner = await prisma.person.findFirstOrThrow({ where: { owner: true } })
    const guest = await prisma.person.findFirstOrThrow({ where: { name: 'Guest' } })
    expect(await setRole(guest.id, 'admin')).toBe('ok')
    expect((await prisma.person.findUniqueOrThrow({ where: { id: guest.id } })).role).toBe('admin')
    expect(await setRole(guest.id, 'member')).toBe('ok')
    expect(await setRole(owner.id, 'member')).toBe('owner-locked')
    expect(await setRole(owner.id, 'admin')).toBe('ok')
    expect(await removePerson(owner.id)).toBe('owner-locked')
    expect(await setRole('nobody', 'admin')).toBe('not-found')
    expect(await removePerson('nobody')).toBe('not-found')
    expect(await prisma.person.count({ where: { owner: true, role: 'admin' } })).toBe(1)
    expect(await removePerson(guest.id)).toBe('ok')
  })

  it('a session reads the level from the database on every request, and the owner is always an admin', async () => {
    const { prisma } = await import('@/lib/db/client')
    const { createSession, readSession } = await import('../session')
    const { createInvite, joinWithPassword } = await import('../household')
    await createInvite(null)
    const invite = await prisma.invite.findFirstOrThrow({ where: { usedAt: null } })
    const guest = (await joinWithPassword(invite.id, 'Guest2', 'fake password three')) as { id: string }
    const token = await createSession(guest.id, null)
    expect(await readSession(token)).toMatchObject({ role: 'member', owner: false })
    await prisma.person.update({ where: { id: guest.id }, data: { role: 'admin' } })
    expect(await readSession(token)).toMatchObject({ role: 'admin' })
    const owner = await prisma.person.findFirstOrThrow({ where: { owner: true } })
    await prisma.person.update({ where: { id: owner.id }, data: { role: 'member' } }) // can't happen through the app
    expect(await readSession(await createSession(owner.id, null))).toMatchObject({ role: 'admin', owner: true })
  })

  it('the recovery code signs in as the owner, so as an admin', async () => {
    const { newRecoveryCode, useRecoveryCode } = await import('../household')
    const { prisma } = await import('@/lib/db/client')
    const code = await newRecoveryCode()
    const person = await useRecoveryCode(code)
    expect(person?.id).toBe((await prisma.person.findFirstOrThrow({ where: { owner: true } })).id)
  })
})

vi.setConfig({ testTimeout: 30_000 })
