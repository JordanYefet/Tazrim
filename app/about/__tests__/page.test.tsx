import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { metadata } from '../page'
import { AboutContent } from '@/components/about/about-content'
import pkg from '@/package.json'
import { STORY } from '@/lib/about/content'

describe('AboutPage', () => {
  const html = renderToStaticMarkup(<AboutContent />)

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

  it('says honestly what leaves the computer: the daily question to GitHub', () => {
    expect(html).toContain('הנתונים לא יוצאים מהמחשב')
    expect(html).toContain(
      'כל הקבצים מפוענחים ונשמרים מקומית, והגופן מוגש מהאפליקציה עצמה. הדבר היחיד שיוצא: פעם ביום תזרים שואל את GitHub אם יש גרסה חדשה, ואפשר לכבות את זה בהגדרות ← עדכונים.'
    )
    expect(html).not.toContain('שום דבר לא נשלח החוצה')
  })

  it('the read-only demo never checks, so it does not mention the daily question or the Updates page', () => {
    const h = renderToStaticMarkup(<AboutContent readOnly />)
    expect(h).toContain('כל הקבצים מפוענחים ונשמרים מקומית, והגופן מוגש מהאפליקציה עצמה.')
    expect(h).not.toContain('פעם ביום תזרים שואל את GitHub')
    expect(h).not.toContain('הגדרות ← עדכונים')
  })

  it('the version card moved to Settings → Updates: only the plain version line here', () => {
    expect(html).not.toContain('בדיקת עדכונים')
  })

  it('publishes no email address', () => {
    expect(html).not.toContain('mailto:')
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
  })

  it('names the browser tab', () => {
    expect(metadata.title).toBe('אודות · תזרים')
  })
})
