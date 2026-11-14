/**
 * The "this computer" door (ENG-119): a tiny HTTP proxy in front of the Next.js
 * server, on its own port, that only the computer itself can reach.
 *
 * In Docker every request reaches the container from the VM's gateway, whether it
 * came from the computer's own browser or from a phone, and headers like Host or
 * X-Forwarded-For are whatever the client wrote. What can't be faked is which
 * port the connection came in on: docker-compose.yml publishes this door
 * (3001 inside) on the host's 127.0.0.1 only, and the app itself (3000) for phones.
 *
 * The door forwards every request to 127.0.0.1:$PORT unchanged (method, path,
 * headers with Host as sent, body streamed both ways) and overwrites one header,
 * `x-tazrim-local`, with a random secret made when the process starts. Only this
 * process knows it (process.env.TAZRIM_LOCAL_SECRET, never logged, never sent to
 * the browser), so a client that writes the header itself, straight to port 3000,
 * never matches. lib/local-request.ts isThisComputer() checks it.
 *
 * Started from instrumentation.ts when TAZRIM_LOCAL_PORT is set (the Docker image
 * sets 3001), on TAZRIM_LOCAL_HOST (default 127.0.0.1; the image sets 0.0.0.0,
 * since the loopback publish is what keeps it local there).
 */
import http from 'node:http'
import { randomBytes } from 'node:crypto'
import type { Duplex } from 'node:stream'

export const LOCAL_HEADER = 'x-tazrim-local'

/** Headers that belong to one connection, never forwarded (RFC 9110 §7.6.1) */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const g = globalThis as unknown as { __tazrimLocalDoor?: { server: http.Server; port: number } }

/** The door's port from the environment, or null when it is off */
export function localDoorPort(): number | null {
  const raw = process.env.TAZRIM_LOCAL_PORT?.trim()
  if (!raw) return null
  const port = Number(raw)
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
}

/**
 * The headers to send upstream: hop-by-hop ones (and any the Connection header
 * names) dropped, every `x-tazrim-local` the client sent replaced by the secret.
 * Kept as raw pairs so repeated headers and the client's spelling survive.
 */
export function forwardHeaders(rawHeaders: string[], secret: string, keepUpgrade = false): string[] {
  const named = new Set<string>()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'connection') {
      for (const t of rawHeaders[i + 1].split(',')) if (t.trim()) named.add(t.trim().toLowerCase())
    }
  }
  const out: string[] = []
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase()
    if (name === LOCAL_HEADER) continue
    if (keepUpgrade && (name === 'connection' || name === 'upgrade')) {
      out.push(rawHeaders[i], rawHeaders[i + 1])
      continue
    }
    if (HOP_BY_HOP.has(name) || named.has(name)) continue
    out.push(rawHeaders[i], rawHeaders[i + 1])
  }
  out.push(LOCAL_HEADER, secret)
  return out
}

/** The upstream's response headers, minus hop-by-hop ones */
function backHeaders(rawHeaders: string[]): string[] {
  const named = new Set<string>()
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'connection') {
      for (const t of rawHeaders[i + 1].split(',')) if (t.trim()) named.add(t.trim().toLowerCase())
    }
  }
  const out: string[] = []
  for (let i = 0; i < rawHeaders.length; i += 2) {
    const name = rawHeaders[i].toLowerCase()
    if (HOP_BY_HOP.has(name) || named.has(name)) continue
    out.push(rawHeaders[i], rawHeaders[i + 1])
  }
  return out
}

/** A proxy server to 127.0.0.1:`upstreamPort` that stamps every request with `secret`. Not listening yet. */
export function createLocalDoor(upstreamPort: number, secret: string): http.Server {
  const server = http.createServer((req, res) => {
    const up = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req.rawHeaders, secret) as unknown as http.OutgoingHttpHeaders,
      setHost: false,
    })
    up.on('response', upRes => {
      res.writeHead(upRes.statusCode ?? 502, upRes.statusMessage, backHeaders(upRes.rawHeaders) as unknown as http.OutgoingHttpHeaders)
      upRes.pipe(res)
      upRes.on('error', () => res.destroy())
    })
    up.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('Tazrim is not answering yet. Try again in a moment.\n')
      } else {
        res.destroy()
      }
    })
    req.on('error', () => up.destroy())
    res.on('close', () => {
      if (!res.writableFinished) up.destroy()
    })
    req.pipe(up)
  })

  // WebSockets (the dev server's hot reload): the same stamp, then the two sockets joined
  server.on('upgrade', (req, socket: Duplex, head: Buffer) => {
    const up = http.request({
      host: '127.0.0.1',
      port: upstreamPort,
      method: req.method,
      path: req.url,
      headers: forwardHeaders(req.rawHeaders, secret, true) as unknown as http.OutgoingHttpHeaders,
      setHost: false,
    })
    up.on('upgrade', (upRes, upSocket, upHead) => {
      const lines = [`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}`]
      for (let i = 0; i < upRes.rawHeaders.length; i += 2) lines.push(`${upRes.rawHeaders[i]}: ${upRes.rawHeaders[i + 1]}`)
      socket.write(lines.join('\r\n') + '\r\n\r\n')
      if (upHead.length) socket.write(upHead)
      if (head.length) upSocket.write(head)
      upSocket.pipe(socket).pipe(upSocket)
      upSocket.on('error', () => socket.destroy())
      socket.on('error', () => upSocket.destroy())
    })
    up.on('response', upRes => {
      // Refused the upgrade: pass the plain answer on and close
      socket.end(`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage}\r\nconnection: close\r\n\r\n`)
      upRes.resume()
    })
    up.on('error', () => socket.end('HTTP/1.1 502 Bad Gateway\r\nconnection: close\r\n\r\n'))
    socket.on('error', () => up.destroy())
    up.end()
  })

  server.on('clientError', (_err, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nconnection: close\r\n\r\n')
  })
  return server
}

/**
 * Starts the door once per process when TAZRIM_LOCAL_PORT is set (and not
 * `off`, as in the read-only demo); otherwise makes sure no secret came in
 * from outside, so isThisComputer() is false. Safe to call twice (Next may run
 * register() again in development): the open door and its secret stay.
 */
export function startLocalDoor({ off = false }: { off?: boolean } = {}): void {
  if (g.__tazrimLocalDoor) return
  const port = off ? null : localDoorPort()
  if (!port) {
    delete process.env.TAZRIM_LOCAL_SECRET
    return
  }
  const secret = randomBytes(32).toString('hex')
  process.env.TAZRIM_LOCAL_SECRET = secret
  const upstream = Number(process.env.PORT) || 3000
  const host = process.env.TAZRIM_LOCAL_HOST?.trim() || '127.0.0.1'
  const server = createLocalDoor(upstream, secret)
  g.__tazrimLocalDoor = { server, port }
  server.on('error', e => {
    // Port taken, for example: the app still works, only without "this computer"
    console.warn(`[tazrim] this-computer door could not open on ${host}:${port}: ${(e as Error).message}`)
    delete process.env.TAZRIM_LOCAL_SECRET
  })
  server.listen(port, host, () => console.log(`[tazrim] this-computer door on ${host}:${port} → 127.0.0.1:${upstream}`))
}
