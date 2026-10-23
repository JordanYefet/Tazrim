import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { isReadOnly } from '@/lib/read-only'

/**
 * The live demo on Vercel (vercel.json, .github/workflows/demo.yml): the
 * build makes prisma/demo.db and bundles it (next.config.ts), but a
 * deployment's files can't be written and SQLite opens its file for writing.
 * So the first request of each server instance copies it to the temp folder
 * and the app opens that copy. Read-only mode keeps every write out anyway.
 *
 * Undefined anywhere else: the usual database is used.
 */
export function vercelDemoDatabaseUrl(): string | undefined {
  if (!process.env.VERCEL || !isReadOnly()) return undefined
  const source = path.join(process.cwd(), 'prisma', 'demo.db')
  const target = path.join(os.tmpdir(), 'tazrim-demo.db')
  if (!fs.existsSync(target)) {
    // Copied under a temporary name and renamed, so a parallel request never opens half a file
    const partial = `${target}.${process.pid}.partial`
    fs.copyFileSync(source, partial)
    fs.renameSync(partial, target)
  }
  return `file:${target}`
}
