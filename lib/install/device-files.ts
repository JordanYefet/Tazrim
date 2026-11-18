/**
 * The files a phone, tablet or another computer installs once to trust Tazrim's HTTPS (ENG-123):
 *   - tazrim-root.crt: Caddy's root certificate (PEM), for Android, Mac and Windows
 *   - tazrim.mobileconfig: an iPhone/iPad profile with that certificate, plus DNS-over-HTTPS for
 *     the .internal names when this computer's address is known
 * The app serves both itself (app/tazrim.mobileconfig, app/tazrim-root.crt) so a phone fetches
 * them over the Wi-Fi; `docker compose run --rm device-profile` still writes the same files.
 *
 * Public on purpose (lib/auth/config.ts DEVICE_FILES): a phone isn't signed in yet when it needs
 * them. They hold the public root certificate and this computer's home-network address, nothing
 * else; Caddy never hands over a key (docker-compose.yml, its port 2016).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isHostName, isPrivateIPv4 } from '@/updater/env-file.mjs'

/** Inside Caddy's data folder */
export const ROOT_CERT_IN_CADDY_DATA = 'caddy/pki/authorities/local/root.crt'
/** Caddy's own little server for the app (docker-compose.yml): only /root.crt, on this Docker network */
export const DEFAULT_CADDY_URL = 'http://caddy:2016'

const PEM_RE = /-----BEGIN CERTIFICATE-----\r?\n([A-Za-z0-9+/=\r\n]+?)-----END CERTIFICATE-----/

/** The first certificate in `pem`, as one base64 line (the DER the profile wants), or null */
export function pemBody(pem: string): string | null {
  const m = PEM_RE.exec(pem)
  if (!m) return null
  const body = m[1].replace(/[\r\n]/g, '')
  return body.length >= 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(body) ? body : null
}

/** The certificate alone, as a clean PEM file (no keys, nothing around it), or null */
export function cleanPem(pem: string): string | null {
  const body = pemBody(pem)
  if (!body) return null
  return `-----BEGIN CERTIFICATE-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface ProfileInput {
  certPem: string
  /** This computer on the home network; without it the profile has the certificate only */
  lanIp: string
  dnsHost: string
  httpsPort: string
}

/**
 * The iPhone/iPad profile, as the device-profile service writes it: the root certificate
 * ("Caddy Local Authority") and, with the address, DNS over HTTPS for .internal only
 * (https://<dns host>/dns-query/phones, which AdGuard knows as the "phones" client).
 * Fixed UUIDs: installing a new one replaces the old. Null when the certificate isn't one.
 */
export function buildMobileconfig({ certPem, lanIp, dnsHost, httpsPort }: ProfileInput): string | null {
  const cert = pemBody(certPem)
  if (!cert) return null
  const host = isHostName(dnsHost) ? dnsHost : 'dns.internal'
  const port = /^\d{1,5}$/.test(httpsPort) && httpsPort !== '443' ? `:${httpsPort}` : ''
  const dns = isPrivateIPv4(lanIp)
    ? `
    <dict>
      <key>PayloadDisplayName</key><string>Tazrim names (.internal)</string>
      <key>PayloadIdentifier</key><string>tazrim.profile.dns</string>
      <key>PayloadType</key><string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key><string>7A1D2C3B-4E5F-4A6B-8C7D-9E0F1A2B3C03</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key><string>HTTPS</string>
        <key>ServerURL</key><string>${xml(`https://${host}${port}/dns-query/phones`)}</string>
        <key>ServerAddresses</key><array><string>${xml(lanIp)}</string></array>
        <key>SupplementalMatchDomains</key><array><string>internal</string></array>
      </dict>
    </dict>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key><string>Tazrim</string>
  <key>PayloadDescription</key><string>Trusts Tazrim's own certificates and finds its .internal names on the computer that runs it.</string>
  <key>PayloadIdentifier</key><string>tazrim.profile</string>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>7A1D2C3B-4E5F-4A6B-8C7D-9E0F1A2B3C01</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadDisplayName</key><string>Caddy Local Authority</string>
      <key>PayloadIdentifier</key><string>tazrim.profile.root</string>
      <key>PayloadType</key><string>com.apple.security.root</string>
      <key>PayloadUUID</key><string>7A1D2C3B-4E5F-4A6B-8C7D-9E0F1A2B3C02</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadContent</key><data>${cert}</data>
    </dict>${dns}
  </array>
</dict>
</plist>
`
}

/**
 * Caddy's root certificate, or null when there is none yet (HTTPS off, or Caddy still starting).
 * TAZRIM_CADDY_DATA (a folder like Caddy's /data) reads the file directly: for running outside
 * Docker, and for tests. Otherwise it asks Caddy on the Docker network (TAZRIM_CADDY_URL):
 * Caddy's files are readable by root only, and the app runs as a user.
 */
export async function readRootCert(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  try {
    let text: string
    if (env.TAZRIM_CADDY_DATA) {
      text = await readFile(path.join(env.TAZRIM_CADDY_DATA, ROOT_CERT_IN_CADDY_DATA), 'utf8')
    } else {
      const res = await fetch(`${env.TAZRIM_CADDY_URL || DEFAULT_CADDY_URL}/root.crt`, { cache: 'no-store', signal: AbortSignal.timeout(2000) })
      if (!res.ok) return null
      text = await res.text()
    }
    return cleanPem(text.slice(0, 20_000))
  } catch {
    return null
  }
}
