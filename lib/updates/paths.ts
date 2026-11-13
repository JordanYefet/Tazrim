/**
 * Where the database lives and the "updating" flag (ENG-98). Sync fs on purpose:
 * middleware.ts checks the flag on every request.
 */
import fs from 'node:fs'
import path from 'node:path'

/** The folder of the database file in use: /data in Docker, prisma/ in dev (Prisma resolves a relative file: URL against prisma/) */
export function dataDir(): string {
  const url = process.env.TAZRIM_DATABASE_URL
  const prismaDir = path.resolve(process.cwd(), 'prisma')
  if (!url?.startsWith('file:')) return prismaDir
  const file = url.slice('file:'.length).split('?')[0]
  return path.dirname(path.isAbsolute(file) ? file : path.resolve(prismaDir, file))
}

const flagFile = () => path.join(dataDir(), '.updating')

/** While the flag exists, writes are paused (lib/read-only.ts) and syncs refuse to start */
export function setUpdating(on: boolean): void {
  if (on) fs.writeFileSync(flagFile(), new Date().toISOString())
  else fs.rmSync(flagFile(), { force: true })
}

export function isUpdating(): boolean {
  return fs.existsSync(flagFile())
}
