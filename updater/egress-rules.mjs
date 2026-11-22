/**
 * The rules for what may be added to the network allowlist (ENG-131/133): pure, Node built-ins
 * only. Shared by scripts/egress-allowlist.mjs, its test and the updater, so a domain a person
 * adds from the app is held to the same bar as the ones the repository ships.
 */

/** Broad shared hosts: anyone can host anything there, so code could send data out through them */
export const SHARED_HOSTS = Object.freeze([
  'github.com', 'githubusercontent.com', 'pastebin.com', 'paste.ee', 'hastebin.com', 'webhook.site',
  'requestbin.com', 'pipedream.net', 'ngrok.io', 'ngrok-free.app', 'discord.com', 'discordapp.com', 'telegram.org',
  't.me', 'slack.com', 'dropbox.com', 'drive.google.com', 'docs.google.com', 'script.google.com', 'transfer.sh',
  'amazonaws.com', 'cloudfront.net', 'azurewebsites.net', 'blob.core.windows.net', 'appspot.com', 'herokuapp.com',
  'workers.dev', 'pages.dev', 'netlify.app', 'vercel.app', 'firebaseio.com', 'web.app', 'googleapis.com',
  'google.com', 'cloudflare.com', 'jsdelivr.net', 'unpkg.com', 'githubassets.com', 'gitlab.com', 'bitbucket.org',
])

/** Bare TLDs and public suffixes: allowing one would allow every site under it */
export const PUBLIC_SUFFIXES = Object.freeze([
  'il', 'co.il', 'org.il', 'net.il', 'gov.il', 'ac.il', 'muni.il', 'k12.il', 'idf.il',
  'com', 'net', 'org', 'io', 'info', 'biz', 'edu', 'gov', 'me', 'app', 'dev', 'xyz', 'online', 'site', 'cloud',
  'co', 'us', 'uk', 'co.uk', 'eu', 'de', 'fr', 'ru', 'cn', 'tv', 'cc', 'ws', 'to', 'ly', 'sh', 'ai',
])

/** ".a.com" covers "a.com" and every subdomain; "a.com" covers only itself */
export function covers(rule, host) {
  if (rule === host) return true
  return rule.startsWith('.') && (host === rule.slice(1) || host.endsWith(rule))
}

const HOST_RE = /^\.?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/**
 * Checks and normalises a domain somebody wants to allow: `{ ok: true, domain }` (lower case,
 * a leading dot kept) or `{ ok: false, code }` with BAD_DOMAIN, SHARED_HOST or TOO_BROAD.
 * Never an IP address, a URL, a port or a wildcard.
 */
export function checkDomain(input) {
  if (typeof input !== 'string') return { ok: false, code: 'BAD_DOMAIN' }
  const domain = input.trim().toLowerCase()
  const bare = domain.replace(/^\./, '')
  // A public suffix itself (checked first: a bare ".il" is not a host name by the pattern below)
  if (PUBLIC_SUFFIXES.includes(bare)) return { ok: false, code: 'TOO_BROAD' }
  if (domain.length > 253 || !HOST_RE.test(domain)) return { ok: false, code: 'BAD_DOMAIN' }
  // A name made only of digits and dots is an IP address, whatever the regex above thought
  if (/^[0-9.]+$/.test(bare) || bare.split('.').every(l => /^\d+$/.test(l))) return { ok: false, code: 'BAD_DOMAIN' }
  // A shared host, or anything under one or above one
  if (SHARED_HOSTS.some(h => bare === h || bare.endsWith(`.${h}`) || h.endsWith(`.${bare}`))) return { ok: false, code: 'SHARED_HOST' }
  return { ok: true, domain }
}
