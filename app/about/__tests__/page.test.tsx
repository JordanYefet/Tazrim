import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import AboutPage, { metadata } from '../page'
import pkg from '@/package.json'
import { STORY } from '@/lib/about/content'

describe('AboutPage', () => {
  const html = renderToStaticMarkup(<AboutPage />)

  it('has every section the issue asks for', () => {
    for (const title of ['הסיפור', 'המטרה', 'פרטיות', 'קוד פתוח ורישיון', 'יצירת קשר']) {
      expect(html).toContain(`>${title}</h2>`)
    }
    for (const paragraph of STORY) expect(html).toContain(paragraph)
  })

  it('links to the repo, the license and GitHub Issues, and shows the version', () => {
    expect(html).toContain('href="https://github.com/JordanYefet/Tazrim"')
    expect(html).toContain('href="https://github.com/JordanYefet/Tazrim/blob/main/LICENSE"')
    expect(html).toContain('href="https://github.com/JordanYefet/Tazrim/issues/new"')
    expect(html).toContain(pkg.version)
  })

  it('publishes no email address', () => {
    expect(html).not.toContain('mailto:')
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })

  it('names the browser tab', () => {
    expect(metadata.title).toBe('אודות · תזרים')
  })
})
