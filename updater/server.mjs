/**
 * The updater helper (ENG-98): a small HTTP service on the compose network that updates and
 * rolls back the Tazrim container on the app's request. Node built-ins only; run as
 * `node /app/updater/server.mjs` with the Docker socket and the data volume mounted.
 *
 * Every path is under /v1/ and needs `Authorization: Bearer <token>`, the token being the one
 * this helper writes to <dataDir>/.updater-token for the app to read.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.mjs'
import { createDocker } from './docker.mjs'
import { createJobs, IMAGE } from './job.mjs'
import { createStatusStore } from './status.mjs'

export const PORT = 8080
export const API_VERSION = 1
const MAX_BODY = 4096
const TOKEN_RE = /^[0-9a-f]{64}$/

/** Reads the token file, or writes a new random one; always 0600 and owned by the app's user (1000:1000) */
export function ensureToken(dataDir, { chown = fs.chownSync } = {}) {
  const file = path.join(dataDir, '.updater-token')
  let token = ''
  try {
    token = fs.readFileSync(file, 'utf8').trim()
  } catch {
    // first start
  }
  if (!TOKEN_RE.test(token)) {
    token = crypto.randomBytes(32).toString('hex')
    fs.writeFileSync(file, token, { mode: 0o600 })
  }
  fs.chmodSync(file, 0o600)
  chown(file, 1000, 1000)
  return token
}

const sha256 = s => crypto.createHash('sha256').update(s).digest()

function send(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Cache-Control': 'no-store' })
  res.end(data)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', c => {
      size += c.length
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('body too large'), { status: 413 }))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) return resolve({})
      try {
        resolve(JSON.parse(text))
      } catch {
        reject(Object.assign(new Error('the body must be JSON'), { status: 400 }))
      }
    })
    req.on('error', reject)
  })
}

export function createServer({ jobs, token, helperVersion }) {
  // Compare hashes: same length always, so timingSafeEqual never throws and the length doesn't leak
  const expected = sha256(token)
  const authorized = header => {
    const m = /^Bearer (\S+)$/.exec(header ?? '')
    return Boolean(m) && crypto.timingSafeEqual(sha256(m[1]), expected)
  }

  const routes = {
    'GET /v1/health': async () => {
      try {
        return [200, { ok: true, helperVersion, api: API_VERSION, ...(await jobs.health()) }]
      } catch (e) {
        return [200, { ok: true, helperVersion, api: API_VERSION, updatable: false, image: '', runningVersion: null, error: String(e?.message ?? e) }]
      }
    },
    'GET /v1/status': async () => [200, jobs.current()],
    'POST /v1/update': async req => {
      const body = await readJson(req)
      const r = await jobs.startUpdate(body?.version)
      return r.status === 202 ? [202, { job: r.job }] : [r.status, { code: r.code, error: r.error }]
    },
    'POST /v1/rollback': async () => {
      const r = await jobs.startRollback()
      return r.status === 202 ? [202, { job: r.job }] : [r.status, { code: r.code, error: r.error }]
    },
  }

  return http.createServer(async (req, res) => {
    try {
      if (!authorized(req.headers.authorization)) return send(res, 401, { error: 'unauthorized' })
      const { pathname } = new URL(req.url ?? '/', 'http://updater')
      const route = routes[`${req.method} ${pathname}`]
      if (!route) {
        const known = Object.keys(routes).some(k => k.endsWith(` ${pathname}`))
        return send(res, known ? 405 : 404, { error: known ? 'method not allowed' : 'not found' })
      }
      const [status, body] = await route(req)
      send(res, status, body)
    } catch (e) {
      if (!res.headersSent) send(res, e?.status ?? 500, { error: e?.status ? e.message : 'internal error' })
      if (!e?.status) console.error('updater:', e)
    }
  })
}

function helperVersionFromPackage() {
  try {
    return JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

/** `file:/data/tazrim.db` -> `/data/tazrim.db` */
function dbFileFromEnv() {
  const url = process.env.TAZRIM_DATABASE_URL ?? 'file:/data/tazrim.db'
  const file = url.startsWith('file:') ? url.slice('file:'.length).split('?')[0] : ''
  if (!path.isAbsolute(file)) throw new Error(`TAZRIM_DATABASE_URL must be an absolute file: URL, got ${url}`)
  return file
}

function main() {
  const dbFile = dbFileFromEnv()
  const dataDir = path.dirname(dbFile)
  const token = ensureToken(dataDir)
  const docker = createDocker({ image: IMAGE })
  // Negotiated now so a too-old Docker shows in the log at once; /v1/health reports it too
  docker.api().then(
    v => console.log(`updater: Docker API ${v}`),
    e => console.warn(`updater: ${e?.message ?? e}`),
  )
  const app = createApp({ url: process.env.TAZRIM_APP_URL || 'http://tazrim:3000', token, dbFile })
  const status = createStatusStore(path.join(dataDir, '.update-status.json'))
  const jobs = createJobs({ docker, app, status })
  createServer({ jobs, token, helperVersion: helperVersionFromPackage() }).listen(PORT, () => {
    console.log(`updater: listening on :${PORT} (api v${API_VERSION}), data in ${dataDir}`)
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
