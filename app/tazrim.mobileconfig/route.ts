import { buildMobileconfig, readRootCert } from '@/lib/install/device-files'
import { deviceFileMissing } from '@/lib/install/network'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

/**
 * The iPhone/iPad profile (ENG-123): Caddy's root certificate and DNS for .internal. Public (a
 * phone isn't signed in yet); see lib/install/device-files.ts for what it holds.
 */
export async function GET() {
  if (isReadOnly()) return deviceFileMissing()
  const certPem = await readRootCert()
  const profile =
    certPem &&
    buildMobileconfig({
      certPem,
      lanIp: process.env.TAZRIM_LAN_IP ?? '',
      dnsHost: process.env.TAZRIM_DNS_HOST || 'dns.internal',
      httpsPort: process.env.TAZRIM_HTTPS_PORT || '443',
    })
  if (!profile) return deviceFileMissing()
  return new Response(profile, {
    headers: {
      'Content-Type': 'application/x-apple-aspen-config',
      'Content-Disposition': 'attachment; filename="tazrim.mobileconfig"',
      'Cache-Control': 'no-store',
    },
  })
}
