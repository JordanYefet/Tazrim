import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InstallView } from '@/lib/install/types'
import { InstallSettings } from '../install-settings'
import { ManualEnvSteps } from '../container-settings'

// Made-up values only.
const view = (extra: Partial<InstallView> = {}): InstallView => ({
  helper: 'ready',
  reason: null,
  values: { TAZRIM_PORT: '3005', TAZRIM_PHONE_PORT: '3006', COMPOSE_PROFILES: 'updater', TAZRIM_LAN_IP: '192.168.1.20', TAZRIM_HOST: 'tazrim.internal', TAZRIM_DNS_HOST: 'dns.internal', TAZRIM_DNS_BIND: '127.0.0.1' },
  fileValues: null,
  installDir: '/home/someone/tazrim',
  job: null,
  ...extra,
})

describe('InstallSettings', () => {
  it('shows both addresses and save buttons with the helper', () => {
    const html = renderToStaticMarkup(<InstallSettings initial={view()} />)
    expect(html).toContain('http://localhost:3005')
    expect(html.replace(/<!-- -->/g, '')).toContain('http://192.168.1.20:3006')
    expect(html.match(/>שמירה</g)).toHaveLength(2)
    expect(html).not.toContain('הצגת שלבים ידניים')
  })

  it('without the helper: no save buttons, manual steps per field, and why', () => {
    const html = renderToStaticMarkup(<InstallSettings initial={view({ helper: 'none', installDir: null })} />)
    expect(html).not.toContain('>שמירה<')
    expect(html.match(/הצגת שלבים ידניים/g)).toHaveLength(2)
    expect(html).toContain('רכיב העדכון לא פועל')
  })

  it('an older helper says it will work after the next update', () => {
    expect(renderToStaticMarkup(<InstallSettings initial={view({ helper: 'old' })} />)).toContain('אחרי העדכון הבא')
  })
})

describe('ManualEnvSteps', () => {
  it('starts closed', () => {
    const html = renderToStaticMarkup(<ManualEnvSteps lines={['TAZRIM_PORT=3005']} />)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('TAZRIM_PORT=3005')
  })
})
