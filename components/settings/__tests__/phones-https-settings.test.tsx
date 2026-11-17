import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InstallView, NetworkInfo } from '@/lib/install/types'

vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

import { PhonesSettings } from '../phones-settings'
import { HttpsSettings } from '../https-settings'
import { NetworkSettings } from '../network-settings'
import { networkHref } from '@/lib/settings/network-redirect'

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
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<wbr\/?>|<\/?span[^>]*>/g, '')

describe('PhonesSettings', () => {
  it('shows the phone address, the password note and the guides', () => {
    const html = text(renderToStaticMarkup(<PhonesSettings initial={view()} network={net()} />))
    expect(html).toContain('http://192.168.1.20:3006')
    expect(html).toContain('בלי הצפנה')
    expect(html).toContain('href="/settings/network#https"')
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
  it('off: the switch is off, files stay and wait for it, the prerequisite links to the guide', () => {
    const html = text(renderToStaticMarkup(<HttpsSettings initial={view()} network={net()} />))
    expect(html).toMatch(/role="switch" aria-checked="false" aria-labelledby="https-switch-label"/)
    expect(html).toContain('href="/settings/network?guide=reserve"')
    expect(html).toContain('https://tazrim.internal')
    expect(html.match(/קודם מפעילים HTTPS/g)).toHaveLength(2)
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

  it('without the helper: one set of manual steps for both switches', () => {
    const html = renderToStaticMarkup(<HttpsSettings initial={view({}, { helper: 'none' })} network={net()} />)
    expect(html.match(/הצגת שלבים ידניים/g)).toHaveLength(1)
    expect(html).toContain('COMPOSE_PROFILES=updater,https,dns')
    expect(html).toContain('TAZRIM_DNS_BIND=0.0.0.0')
  })
})

describe('NetworkSettings', () => {
  it('one page in the order people need it: phones, HTTPS, the guides, then advanced', () => {
    const html = text(renderToStaticMarkup(<NetworkSettings initial={view()} network={net()} />))
    const at = (s: string) => html.indexOf(s)
    for (const id of ['id="phones"', 'id="https"', 'id="guides"', 'id="advanced"']) expect(at(id)).toBeGreaterThan(-1)
    expect(at('id="phones"')).toBeLessThan(at('id="https"'))
    expect(at('id="https"')).toBeLessThan(at('id="guides"'))
    expect(at('id="guides"')).toBeLessThan(at('id="advanced"'))
  })

  it('every guide once, in two groups', () => {
    const html = text(renderToStaticMarkup(<NetworkSettings initial={view()} network={net()} />))
    for (const g of ['שהכתובת לא תשתנה', 'איפה הכתובת של המחשב', 'התקנה כאפליקציה בטלפון', 'iPhone ו-iPad', 'האישור ב-Android', 'השמות ב-Android', 'מחשבים אחרים']) {
      expect(html).toContain(g)
    }
    const raw = renderToStaticMarkup(<NetworkSettings initial={view()} network={net()} />)
    expect(raw.match(/font-medium">שהכתובת לא תשתנה</g)).toHaveLength(1)
    expect(raw).toContain('>הטלפון</h3>')
    expect(raw).toContain('>HTTPS</h3>')
  })

  it('without the helper: one manual disclosure per section with controls', () => {
    const html = renderToStaticMarkup(<NetworkSettings initial={view({}, { helper: 'none' })} network={net()} />)
    // HTTPS (both switches) and advanced (the address and both ports)
    expect(html.match(/הצגת שלבים ידניים/g)).toHaveLength(2)
    expect(html).toContain('TAZRIM_LAN_IP=192.168.1.20\nTAZRIM_PORT=3005\nTAZRIM_PHONE_PORT=3006')
  })

  it('the old addresses open their section, keeping ?guide=', () => {
    expect(networkHref('phones', {})).toBe('/settings/network#phones')
    expect(networkHref('phones', { guide: 'reserve' })).toBe('/settings/network?guide=reserve#phones')
    expect(networkHref('https', {})).toBe('/settings/network#https')
    expect(networkHref('advanced', { guide: '"><x' })).toBe('/settings/network#advanced')
  })
})

describe('inside /setup', () => {
  it('only the essentials: no full guide list, no Android names switch', () => {
    const phones = text(renderToStaticMarkup(<PhonesSettings inSetup initial={view()} network={net()} />))
    expect(phones).toContain('שהכתובת לא תשתנה')
    expect(phones).not.toContain('איפה הכתובת של המחשב')
    const https = text(renderToStaticMarkup(<HttpsSettings inSetup initial={view()} network={net()} />))
    expect(https).not.toContain('שמות גם ל-Android')
    expect(https).not.toContain('מחשבים אחרים')
  })

  it('no address yet: the field to type it is right there', () => {
    expect(renderToStaticMarkup(<PhonesSettings inSetup initial={view({ TAZRIM_LAN_IP: '' })} network={net()} />)).toContain('container-setting-TAZRIM_LAN_IP')
  })

  it('no card inside the setup card: sections split by hairlines', () => {
    for (const html of [
      renderToStaticMarkup(<PhonesSettings inSetup initial={view()} network={net()} />),
      renderToStaticMarkup(<HttpsSettings inSetup initial={view({ COMPOSE_PROFILES: 'updater,https,dns' })} network={net({ certReady: true })} />),
    ]) {
      expect(html).not.toContain('rounded-xl surface')
      expect(html).toContain('border-t pt-4')
    }
  })

  it('the address breaks only at its seams', () => {
    const html = renderToStaticMarkup(<PhonesSettings inSetup initial={view()} network={net()} />)
    expect(html).toContain('<span class="whitespace-nowrap">http://</span></span><span><wbr/><span class="whitespace-nowrap">192.168.1.20</span></span><span><wbr/><span class="whitespace-nowrap">:3006</span>')
  })
})
