/**
 * Is this request from the machine the app runs on?
 *
 * Used by routes that must never run for someone who reaches the app from
 * outside (a tunnel, a reverse proxy, another device on the network), such as
 * deleting all data.
 *
 * Next.js fills in x-forwarded-host and x-forwarded-for itself on a direct
 * request (from the Host header and the socket address) and keeps whatever a
 * proxy already sent. So a request is local only when:
 *   - there is no `Forwarded` header at all (RFC 7239, only proxies send it),
 *   - the Host header is present and names a loopback host,
 *   - every x-forwarded-host entry is a loopback host,
 *   - every x-forwarded-for and x-real-ip entry is a loopback address.
 *
 * Loopback means `localhost`, 127.0.0.0/8, ::1 or an IPv4-mapped 127.x
 * (::ffff:127.0.0.1), with or without a port, IPv6 with or without brackets.
 * A VS Code / SSH port-forward arrives as localhost and is allowed.
 */
export function isLocalRequest(headers: Headers): boolean {
  if (headers.has('forwarded')) return false

  const host = headers.get('host')
  if (!host || !isLoopbackHost(host)) return false

  for (const name of ['x-forwarded-host', 'x-forwarded-for', 'x-real-ip']) {
    const value = headers.get(name)
    if (value === null) continue
    if (!value.split(',').every(isLoopbackHost)) return false
  }
  return true
}

/**
 * A Host-header style value (`name`, `name:port`, `[v6]`, `[v6]:port`, bare v6)
 * that names this machine. Anything unparsable is not loopback.
 */
export function isLoopbackHost(value: string): boolean {
  const host = stripPort(value.trim().toLowerCase())
  if (host === null) return false
  if (host === 'localhost') return true
  return isLoopbackIPv4(host) || isLoopbackIPv6(host)
}

/** The host part without its port, or null when malformed. */
function stripPort(value: string): string | null {
  if (!value) return null
  if (value.startsWith('[')) {
    const end = value.indexOf(']')
    if (end < 0) return null
    const rest = value.slice(end + 1)
    if (rest && !/^:\d{1,5}$/.test(rest)) return null
    return value.slice(1, end)
  }
  const colons = value.split(':').length - 1
  if (colons === 0) return value
  // More than one colon and no brackets: a bare IPv6 address (no port possible)
  if (colons > 1) return value
  const [name, port] = value.split(':')
  return name && /^\d{1,5}$/.test(port) ? name : null
}

function parseIPv4(value: string): number[] | null {
  const parts = value.split('.')
  if (parts.length !== 4) return null
  const octets = parts.map(p => (/^\d{1,3}$/.test(p) ? Number(p) : NaN))
  return octets.every(o => o >= 0 && o <= 255) ? octets : null
}

function isLoopbackIPv4(value: string): boolean {
  return parseIPv4(value)?.[0] === 127
}

/** The eight 16-bit groups of an IPv6 address, or null when malformed. */
function parseIPv6(value: string): number[] | null {
  const addr = value.replace(/%.*$/, '') // zone id, e.g. ::1%lo0
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const groups = (s: string): number[] | null => {
    if (!s) return []
    const out: number[] = []
    const parts = s.split(':')
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i]
      if (i === parts.length - 1 && p.includes('.')) {
        const v4 = parseIPv4(p)
        if (!v4) return null
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3])
      } else if (/^[0-9a-f]{1,4}$/.test(p)) {
        out.push(parseInt(p, 16))
      } else {
        return null
      }
    }
    return out
  }
  const head = groups(halves[0])
  const tail = halves.length === 2 ? groups(halves[1]) : []
  if (!head || !tail) return null
  if (halves.length === 1) return head.length === 8 ? head : null
  const missing = 8 - head.length - tail.length
  if (missing < 1) return null
  return [...head, ...Array(missing).fill(0), ...tail]
}

function isLoopbackIPv6(value: string): boolean {
  const g = parseIPv6(value)
  if (!g) return false
  const zeros = (n: number) => g.slice(0, n).every(x => x === 0)
  // ::1
  if (zeros(7) && g[7] === 1) return true
  // ::ffff:127.x.x.x (IPv4-mapped)
  return zeros(5) && g[5] === 0xffff && g[6] >> 8 === 127
}
