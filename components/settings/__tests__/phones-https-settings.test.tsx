import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InstallView, NetworkInfo } from '@/lib/install/types'

vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

import { PhonesSettings } from '../phones-settings'
import { HttpsSettings } from '../https-settings'

// Made-up values only.
const view = (values: Partial<InstallView['values']> = {}, extra: Partial<InstallView> = {}): InstallView => ({
  helper: 'ready',
  reason: null,
  values: { TAZRIM_PORT: '3005', TAZRIM_PHONE_PORT: '3006', COMPOSE_PROFILES: 'updater', TAZRIM_LAN_IP: '192.168.1.20', TAZRIM_HOST: 'tazrim.internal', TAZRIM_DNS_HOST: 'dns.internal', TAZRIM_DNS_BIND: '127.0.0.1', ...values },
  fileValues: null,
  installDir: '/home/someone/tazrim',
  job: null,
  ...extra,
})
const net = (extra: Partial<NetworkInfo> = {}): NetworkInfo => ({ lanHints: [], httpsPort: '443', certReady: false, requireHttps: false, ...extra })
const text = (html: string) => html.replace(/<!-- -->/g, '')

describe('PhonesSettings', () => {
  it('shows the phone address, the password note and the guides', () => {
    const html = text(renderToStaticMarkup(<PhonesSettings initial={view()} network={net()} />))
    expect(html).toContain('http://192.168.1.20:3006')
    expect(html).toContain('בלי הצפנה')
    expect(html).toContain('href="/settings/https"')
    for (const g of ['שהכתובת לא תשתנה', 'איפה הכתובת של המחשב', 'התקנה כאפליקציה בטלפון']) expect(html).toContain(g)
  })

  it('without the address: how to find it, and the hints, never a made-up address', () => {
    const html = text(renderToStaticMarkup(<PhonesSettings initial={view({ TAZRIM_LAN_IP: '' })} network={net({ lanHints: ['10.0.0.5'] })} />))
    expect(html).toContain('עוד לא ידוע מה הכתובת')
    expect(html).toContain('10.0.0.5')
    expect(html).not.toContain('http://:3006')
  })

  it('says when passwords need HTTPS', () => {
    expect(renderToStaticMarkup(<PhonesSettings initial={view()} network={net({ requireHttps: true })} />)).toContain('סיסמאות עובדות רק ב-HTTPS')
  })

  it('in /setup without data it loads instead', () => {
    expect(renderToStaticMarkup(<PhonesSettings inSetup />)).toContain('טוען')
  })
})

describe('HttpsSettings', () => {
  it('off: the switch is off, files wait for it, the prerequisite links to the guide', () => {
    const html = text(renderToStaticMarkup(<HttpsSettings initial={view()} network={net()} />))
    expect(html).toMatch(/role="switch" aria-checked="false" aria-labelledby="https-switch-label"/)
    expect(html).toContain('href="/settings/phones?guide=reserve"')
    expect(html).toContain('https://tazrim.internal')
    expect(html.match(/זמין אחרי שמפעילים HTTPS/g)).toHaveLength(2)
  })

  it('on with the certificate: both download links', () => {
    const html = text(renderToStaticMarkup(<HttpsSettings initial={view({ COMPOSE_PROFILES: 'updater,https,dns' })} network={net({ certReady: true, httpsPort: '8443' })} />))
    expect(html).toMatch(/role="switch" aria-checked="true" aria-labelledby="https-switch-label"/)
    expect(html).toContain('href="/tazrim.mobileconfig"')
    expect(html).toContain('href="/tazrim-root.crt"')
    expect(html).toContain('https://tazrim.internal:8443')
  })

  it('no address yet: can’t be turned on', () => {
    const html = renderToStaticMarkup(<HttpsSettings initial={view({ TAZRIM_LAN_IP: '' })} network={net()} />)
    expect(html).toMatch(/aria-labelledby="https-switch-label" disabled=""/)
    expect(html).toContain('עוד לא ידוע מה הכתובת של המחשב')
  })

  it('without the helper: the .env lines to change by hand', () => {
    const html = renderToStaticMarkup(<HttpsSettings initial={view({}, { helper: 'none' })} network={net()} />)
    expect(html.match(/הצגת שלבים ידניים/g)).toHaveLength(2)
  })
})
