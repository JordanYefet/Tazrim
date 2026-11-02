/**
 * The documented design tokens (docs/design-system.md), grouped as the /design
 * page shows them. The values live in app/globals.css only; this lists names
 * and what each is for, and the tests check every name still exists there.
 */
export type TokenFormat = 'hsl' | 'color' | 'shadow' | 'duration' | 'easing' | 'length'

export interface DesignToken {
  /** With the leading `--` */
  name: string
  format: TokenFormat
  purpose: string
  /** .dark gives it its own value */
  themed: boolean
}

export interface TokenGroup {
  id: string
  title: string
  tokens: DesignToken[]
}

const hsl = (name: string, purpose: string): DesignToken => ({ name, format: 'hsl', purpose, themed: true })
const color = (name: string, purpose: string): DesignToken => ({ name, format: 'color', purpose, themed: true })

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'color',
    title: 'צבעי בסיס',
    tokens: [
      hsl('--background', 'רקע העמוד'),
      hsl('--foreground', 'טקסט ראשי'),
      hsl('--card', 'משטח כרטיס'),
      hsl('--primary', 'פעולה ראשית, קישור, מיקוד'),
      hsl('--secondary', 'כפתור משני'),
      hsl('--muted', 'רקע שקט: שדות, מסילות'),
      hsl('--muted-foreground', 'טקסט משני'),
      hsl('--accent', 'ריחוף ובחירה'),
      hsl('--destructive', 'פעולה הרסנית בלבד'),
      hsl('--border', 'קווי מתאר'),
      hsl('--ring', 'טבעת מיקוד'),
    ],
  },
  {
    id: 'semantic',
    title: 'משמעות',
    tokens: [
      hsl('--income', 'הכנסה'),
      hsl('--expense', 'הוצאה'),
      hsl('--cc', 'כרטיס אשראי'),
    ],
  },
  {
    id: 'chart',
    title: 'גרפים',
    tokens: [
      color('--chart-income', 'סדרת הכנסות'),
      color('--chart-expense', 'סדרת הוצאות'),
      color('--chart-cc', 'סדרת כרטיסים'),
      ...Array.from({ length: 10 }, (_, i) => color(`--chart-${i + 1}`, `קטגוריה ${i + 1}`)),
    ],
  },
  {
    id: 'surface',
    title: 'עומק ומשטחים',
    tokens: [
      { name: '--elevation-1', format: 'shadow', purpose: 'משטח: גרפים, רשימות, טבלאות (.surface)', themed: true },
      { name: '--elevation-2', format: 'shadow', purpose: 'מורם: נתונים מרכזיים (.surface-raised)', themed: true },
      { name: '--elevation-hero', format: 'shadow', purpose: 'הנתון הראשי בעמוד (.surface-hero)', themed: true },
      { name: '--elevation-3', format: 'shadow', purpose: 'שכבת על: תפריטים, חלונות (.surface-overlay)', themed: true },
      hsl('--surface-edge', 'קו המתאר של משטחים'),
    ],
  },
  {
    id: 'radius',
    title: 'פינות',
    tokens: [{ name: '--radius', format: 'length', purpose: 'rounded-lg; md ו-sm נגזרים ממנו', themed: false }],
  },
  {
    id: 'motion',
    title: 'תנועה',
    tokens: [
      { name: '--motion-quick', format: 'duration', purpose: 'משוב לחיצה, חלונות קטנים', themed: false },
      { name: '--motion-fast', format: 'duration', purpose: 'יציאות, ריחוף, דעיכות קטנות', themed: false },
      { name: '--motion-base', format: 'duration', purpose: 'שכבות נכנסות: חלונות, גיליונות', themed: false },
      { name: '--motion-page', format: 'duration', purpose: 'עמוד נכנס: מספרים, גרפים', themed: false },
      { name: '--ease-ui', format: 'easing', purpose: 'ברירת המחדל לכל מעבר', themed: false },
      { name: '--ease-spring', format: 'easing', purpose: 'קפיץ: כרטיסים', themed: false },
    ],
  },
]

/** The CSS value that paints the token: HSL triplets need hsl(), the rest are complete */
export function cssValue(token: DesignToken): string {
  return token.format === 'hsl' ? `hsl(var(${token.name}))` : `var(${token.name})`
}
