/**
 * Squid's native access log, read from the end (ENG-133). One line:
 *   time elapsed client code/status bytes method url ident hierarchy type
 *   1763700000.123 45 172.31.1.5 TCP_DENIED/403 3922 CONNECT example.com:443 - HIER_NONE/- text/html
 * A refusal is TCP_DENIED/403. Who: 172.31.1.0/24 is the app, 172.31.2.0/24 the updater.
 * Since ENG-142 a line ends with an 11th field, the Squid port the client used (the log format
 * "tazrim" in docker/squid/squid.conf): a provider's own port says which provider's sync it was.
 * Lines from before have 10 fields and parse as before, with no port.
 */
import fs from 'node:fs'
import { squidLogPath } from './config'
import { MAIN_PORT, providerOfPort } from './provider-ports'
import type { Denied } from './types'

/** Only the end of the log is read */
export const TAIL_BYTES = 512 * 1024
export const DENIED_LIMIT = 50

export function whoIs(client: string): Denied['who'] {
  if (client.startsWith('172.31.1.')) return 'app'
  if (client.startsWith('172.31.2.')) return 'updater'
  return 'other'
}

/** `CONNECT host:443` or a full URL, as the host name alone (lowercase); null when it is neither */
export function hostOf(method: string, url: string): string | null {
  let host: string
  if (method === 'CONNECT') {
    host = url.startsWith('[') ? url.slice(0, url.indexOf(']') + 1) : url.replace(/:\d+$/, '')
  } else {
    try {
      host = new URL(url).hostname
    } catch {
      return null
    }
  }
  host = host.trim().toLowerCase()
  return host && /^[\w.[\]:-]+$/.test(host) ? host : null
}

/** One log line as a refusal, or null for anything else (an allowed request, a malformed line) */
export function parseDenied(line: string): Denied | null {
  const f = line.trim().split(/\s+/)
  if (f.length < 7 || f[3] !== 'TCP_DENIED/403') return null
  const time = Number(f[0])
  const host = hostOf(f[5], f[6])
  if (!Number.isFinite(time) || !host) return null
  const port = /^\d{1,5}$/.test(f[10] ?? '') ? Number(f[10]) : undefined
  const provider = port === undefined ? null : providerOfPort(port)
  return { at: Math.round(time * 1000), who: whoIs(f[2]), host, ...(port !== undefined ? { port } : {}), ...(provider ? { provider } : {}) }
}

/** Every refusal in `text`, newest first, at most `limit` */
export function parseDeniedLines(text: string, limit = DENIED_LIMIT): Denied[] {
  const out: Denied[] = []
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const d = parseDenied(lines[i])
    if (d) out.push(d)
  }
  return out.sort((a, b) => b.at - a.at)
}

/** The last TAIL_BYTES of a file as text, without the line it cut in two; '' when it can't be read */
export function readTail(file: string, bytes = TAIL_BYTES): string {
  let fd: number | null = null
  try {
    fd = fs.openSync(file, 'r')
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    const text = buf.toString('utf8')
    if (start === 0) return text
    const nl = text.indexOf('\n')
    return nl === -1 ? '' : text.slice(nl + 1)
  } catch {
    return ''
  } finally {
    if (fd !== null) fs.closeSync(fd)
  }
}

/** The last refusals, newest first */
export function recentDenied(limit = DENIED_LIMIT, file = squidLogPath()): Denied[] {
  return parseDeniedLines(readTail(file), limit)
}

/**
 * The hosts the app was refused between two moments (a sync's start and failure), once each, in the
 * order first refused. With `company` (ENG-142) only that company's: what came in on its own port, and
 * lines that say no port (an older log). Several syncs side by side no longer mix their lists.
 * The main port is the app's own Node calls, which only One Zero's scraper makes.
 */
export function blockedDuring(startMs: number, endMs: number, file = squidLogPath(), company?: string): string[] {
  const slack = 2000
  const hosts: string[] = []
  const lines = parseDeniedLines(readTail(file), Number.MAX_SAFE_INTEGER).reverse()
  const mine = (d: Denied) => !company || d.port === undefined || d.provider === company || (d.port === MAIN_PORT && company === 'oneZero')
  for (const d of lines) {
    if (d.who === 'app' && mine(d) && d.at >= startMs - slack && d.at <= endMs + slack && !hosts.includes(d.host)) hosts.push(d.host)
  }
  return hosts
}
