import { readRootCert } from '@/lib/install/device-files'
import { deviceFileMissing } from '@/lib/install/network'
import { isReadOnly } from '@/lib/read-only'

export const dynamic = 'force-dynamic'

/** Caddy's root certificate (ENG-123), for Android, Mac and Windows. Public: it's the public certificate only. */
export async function GET() {
  if (isReadOnly()) return deviceFileMissing()
  const pem = await readRootCert()
  if (!pem) return deviceFileMissing()
  return new Response(pem, {
    headers: {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Disposition': 'attachment; filename="tazrim-root.crt"',
      'Cache-Control': 'no-store',
    },
  })
}
