/**
 * Throwaway SQLite databases for DB tests.
 *
 * A test DB is a temp file built by running the real migration SQL files in
 * order with the sqlite3 CLI, so the tests exercise the same schema (and the
 * same back-fill) as the app. lib/db/client.ts points Prisma at it through
 * TAZRIM_DATABASE_URL. Only made-up values go into these databases.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../../prisma/migrations')

export function migrationNames(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
}

export interface TestDb {
  file: string
  url: string
  exec(sql: string): void
  query<T = Record<string, unknown>>(sql: string): T[]
  applyMigration(name: string): void
  applyDown(name: string): void
  cleanup(): void
}

/**
 * Creates a DB with every migration applied, or only the ones before `before`
 * (to build a legacy DB that a later migration then upgrades).
 */
export function createTestDb(opts: { before?: string } = {}): TestDb {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tazrim-test-'))
  const file = path.join(dir, 'test.db')

  const exec = (sql: string) => {
    execFileSync('sqlite3', ['-bail', file], { input: sql })
  }
  const query = <T,>(sql: string): T[] => {
    const out = execFileSync('sqlite3', ['-json', file, sql]).toString().trim()
    return out ? (JSON.parse(out) as T[]) : []
  }
  const applyMigration = (name: string) => {
    exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'))
    exec(
      `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "applied_steps_count")
       VALUES ('test-${name}', 'test', '${name}', CURRENT_TIMESTAMP, 1);`
    )
  }
  const applyDown = (name: string) => {
    exec(fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'down.sql'), 'utf8'))
  }

  // Same bookkeeping table Prisma creates, so down.sql can remove its row.
  exec(`CREATE TABLE "_prisma_migrations" (
    "id"                    TEXT PRIMARY KEY NOT NULL,
    "checksum"              TEXT NOT NULL,
    "finished_at"           DATETIME,
    "migration_name"        TEXT NOT NULL,
    "logs"                  TEXT,
    "rolled_back_at"        DATETIME,
    "started_at"            DATETIME NOT NULL DEFAULT current_timestamp,
    "applied_steps_count"   INTEGER UNSIGNED NOT NULL DEFAULT 0
);`)

  for (const name of migrationNames()) {
    if (opts.before && name >= opts.before) break
    applyMigration(name)
  }

  return {
    file,
    url: `file:${file}`,
    exec,
    query,
    applyMigration,
    applyDown,
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  }
}

/**
 * Points lib/db/client.ts at `db` and drops any cached client. Import lib/db
 * modules dynamically after calling this.
 */
export function usePrismaOn(db: TestDb) {
  process.env.TAZRIM_DATABASE_URL = db.url
  ;(globalThis as { prisma?: unknown }).prisma = undefined
}

export async function releasePrisma() {
  const g = globalThis as { prisma?: { $disconnect(): Promise<void> } }
  await g.prisma?.$disconnect()
  g.prisma = undefined
  delete process.env.TAZRIM_DATABASE_URL
}
