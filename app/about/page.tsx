import type { Metadata } from 'next'
import { ArrowUpLeft, EyeOff, HardDrive, ServerOff, UserX, type LucideIcon } from 'lucide-react'
import pkg from '@/package.json'
import { CREDITS, ISSUES_URL, LICENSE_URL, NEW_ISSUE_URL, REPO_URL, STORY } from '@/lib/about/content'

export const metadata: Metadata = {
  title: 'אודות · תזרים',
  description: 'למה נבנה תזרים, איך הוא שומר על הפרטיות שלכם, הרישיון ואיך יוצרים קשר.',
}

const PRIVACY: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: HardDrive,
    title: 'הנתונים נשארים אצלכם',
    body: 'כל התנועות נשמרות בקובץ בסיס נתונים אחד, על המחשב שעליו תזרים רץ.',
  },
  {
    icon: ServerOff,
    title: 'שום דבר לא נשלח החוצה',
    body: 'אין שרת מרוחק: הקבצים מפוענחים ונשמרים מקומית, וגם הגופן מוגש מהאפליקציה עצמה, כך שהדפדפן לא פונה לשרתים חיצוניים.',
  },
  {
    icon: UserX,
    title: 'בלי חשבון משתמש',
    body: 'לא נרשמים ולא מתחברים. אין סיסמה לשמור ואין פרטים אישיים למסור.',
  },
  {
    icon: EyeOff,
    title: 'בלי מעקב',
    body: 'אין אנליטיקה, אין פרסומות ואין איסוף של נתוני שימוש.',
  },
]

const H2 = 'text-lg font-semibold tracking-tight'
const PROSE = 'text-[15px] leading-7 text-foreground/85 md:text-base md:leading-8'
const LINK =
  'inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]'

function ExternalLink({
  href,
  children,
  primary = false,
}: {
  href: string
  children: React.ReactNode
  primary?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={
        primary
          ? `${LINK} bg-primary text-primary-foreground hover:bg-primary/90`
          : `${LINK} surface text-foreground hover:bg-muted`
      }
    >
      {children}
      <ArrowUpLeft className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
      <span className="sr-only">(נפתח בכרטיסייה חדשה)</span>
    </a>
  )
}

/** Who made Tazrim and why, how it treats your data, the license and how to get in touch (ENG-59). */
export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl min-w-0 space-y-12 pb-4 md:pt-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">אודות תזרים</h1>
        <p className="text-muted-foreground">
          כלי חינמי וקוד פתוח למעקב אחרי התזרים החודשי של משק בית, שרץ על המחשב שלכם.
        </p>
      </header>

      <section aria-labelledby="story-title" className="space-y-4">
        <h2 id="story-title" className={H2}>הסיפור</h2>
        <div className="space-y-4 border-s-2 border-primary/40 ps-5">
          {STORY.map((paragraph, i) => (
            <p key={i} className={PROSE}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section aria-labelledby="goal-title" className="space-y-3">
        <h2 id="goal-title" className={H2}>המטרה</h2>
        <p className={PROSE}>
          לעזור למשקי בית נוספים לראות בבירור כמה נכנס, כמה יוצא ולאן. תזרים חינמי וקוד פתוח, ואין מאחוריו
          עסק: אין מנוי, אין פרסומות ואין גרסה בתשלום.
        </p>
      </section>

      <section aria-labelledby="privacy-title" className="space-y-4">
        <div className="space-y-1">
          <h2 id="privacy-title" className={H2}>פרטיות</h2>
          <p className="text-sm text-muted-foreground">אלה נתונים רגישים, ולכן תזרים בנוי כך שהם לא יוצאים מהמחשב שלכם.</p>
        </div>
        <ul className="grid gap-x-8 gap-y-5 rounded-xl surface-hero p-5 sm:grid-cols-2 md:p-6">
          {PRIVACY.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-sm leading-6 text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="license-title" className="space-y-3">
        <h2 id="license-title" className={H2}>קוד פתוח ורישיון</h2>
        <p className={PROSE}>
          כל הקוד פתוח ב-GitHub ומופץ תחת רישיון MIT: מותר להשתמש בו, לשנות ולהפיץ אותו, בתנאי שמשאירים את
          הודעת זכויות היוצרים והרישיון.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          תזרים הוא כלי עזר אישי ולא ייעוץ פיננסי, והוא מסופק כמו שהוא, בלי אחריות. כדאי להשוות את המספרים מול
          הבנק וחברות האשראי לפני שמקבלים החלטות.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <ExternalLink href={REPO_URL}>הקוד ב-GitHub</ExternalLink>
          <ExternalLink href={LICENSE_URL}>רישיון MIT</ExternalLink>
        </div>
      </section>

      <section aria-labelledby="contact-title" className="space-y-3">
        <h2 id="contact-title" className={H2}>יצירת קשר</h2>
        <p className={PROSE}>
          מצאתם באג, יש לכם רעיון או שאלה? כל הפניות מתקבלות ב-
          <a href={ISSUES_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">
            GitHub Issues
          </a>
          , כך שכולם יכולים לראות מה כבר דווח ומה בעבודה.
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          כשמדווחים על באג, אל תצרפו קבצים או צילומי מסך עם נתונים אמיתיים. עדיף לתאר את הבעיה במילים, או
          לשחזר אותה במצב הדמו.
        </p>
        <div className="pt-1">
          <ExternalLink href={NEW_ISSUE_URL} primary>פתיחת Issue</ExternalLink>
        </div>
      </section>

      <footer className="space-y-2 border-t pt-6 text-sm text-muted-foreground">
        <p>
          גרסה <span dir="ltr" className="tabular-nums">{pkg.version}</span>
        </p>
        <p className="leading-6">
          נבנה על כתפי פרויקטים של קוד פתוח:{' '}
          {CREDITS.map((c, i) => (
            <span key={c.name}>
              <a
                href={c.url}
                target="_blank"
                rel="noreferrer"
                dir="ltr"
                className="text-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
              >
                {c.name}
              </a>
              {i < CREDITS.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>
      </footer>
    </article>
  )
}
