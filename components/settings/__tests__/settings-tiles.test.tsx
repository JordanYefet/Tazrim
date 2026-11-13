import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SettingsTiles, type SettingsTile } from '../settings-tiles'

const tiles = (dot?: boolean): SettingsTile[] => [
  { href: '/settings/appearance', icon: 'appearance', title: 'מראה', summary: 'תקציר בדוי.' },
  { href: '/about', icon: 'about', title: 'אודות', summary: 'תקציר בדוי.', dot },
]

describe('SettingsTiles', () => {
  it('a tile with a dot says a new version is out, for screen readers too', () => {
    const html = renderToStaticMarkup(<SettingsTiles tiles={tiles(true)} />)
    expect(html).toContain('יש גרסה חדשה')
    expect(html).toContain('data-dot')
  })

  it('no dot, no mark', () => {
    const html = renderToStaticMarkup(<SettingsTiles tiles={tiles()} />)
    expect(html).not.toContain('יש גרסה חדשה')
    expect(html).not.toContain('data-dot')
  })
})
