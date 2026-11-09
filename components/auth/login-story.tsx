import { Home, CreditCard, TrendingUp, Users, type LucideIcon } from 'lucide-react'
import { AppGallery } from './app-gallery'

const FACTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Home, title: 'הנתונים נשארים בבית', body: 'בלי ענן, בלי מנוי ובלי למסור סיסמה של הבנק לאף אחד.' },
  { icon: CreditCard, title: 'כל החשבונות בתמונה אחת', body: 'בנקים וכרטיסי אשראי, עם קטגוריות שלומדות את בתי העסק שלכם.' },
  { icon: TrendingUp, title: 'רואים קדימה', body: 'תחזית ליתרה עד סוף החודש, עם החיובים הקבועים.' },
  { icon: Users, title: 'לכל הבית', body: 'כל אחד נכנס מהמכשיר שלו, ורואים את אותם נתונים.' },
]

/**
 * The sign-in page's other side: what Tazrim is, in four points beside a few
 * screenshots of the demo app, and why it was built, in its author's words.
 * Under the card on phones (without the screenshots), beside it on wide screens.
 */
export function LoginStory() {
  return (
    <section aria-labelledby="story-title" className="flex w-full max-w-[46rem] flex-col gap-7">
      <div className="space-y-2.5">
        <h2 id="story-title" className="text-balance text-3xl font-extrabold leading-[1.1] tracking-tight lg:text-[40px]">
          כל הכסף של הבית, במקום אחד
        </h2>
        <p className="max-w-[56ch] text-[17px] leading-relaxed text-muted-foreground text-pretty">
          מעלים את הקבצים מהבנק ומחברות האשראי, ורואים לאן הולך הכסף, מה חוזר כל חודש ומה צפוי עד סופו. תזרים רץ על מחשב אצלכם בבית, והנתונים לא יוצאים ממנו.
        </p>
      </div>

      <div className="grid items-center gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <ul className="space-y-4">
          {FACTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-start gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-card/70 text-primary shadow-e1 dark:border-white/10">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="space-y-0.5">
                <span className="block text-base font-semibold">{title}</span>
                <span className="block text-sm leading-relaxed text-muted-foreground text-pretty">{body}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="hidden xl:block">
          <AppGallery />
        </div>
      </div>

      <figure className="flex items-start gap-4 rounded-[20px] border border-white/80 bg-card/70 p-5 shadow-e1 dark:border-white/10 md:p-6">
        <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">י</span>
        <div className="space-y-2.5">
          <figcaption className="text-[15px] font-bold">למה בניתי את תזרים</figcaption>
          <blockquote className="max-w-[62ch] space-y-2 text-[15px] leading-relaxed text-pretty">
            <p>
              קוראים לי ירדן, נשוי ואבא לשתי בנות. פעם בחודש קבענו ביומן ערב לעבור על כל הוצאות הבית: חשבון הבנק וכל כרטיסי האשראי. רצינו להבין כמה נכנס, כמה יוצא ועל מה, ומה ההוצאות הקבועות שלנו. זה התברר כאתגר לא פשוט, ורציתי לפתור אותו. כך נולד תזרים, שמרכז את כל התזרים של הבית במקום אחד.
            </p>
            <p>
              הוא רץ אצלכם בבית בכוונה. כך שום מידע לא נשמר אצל אף אחד אחר, והוא חינמי לגמרי: לא רציתי לגבות על זה כסף, ולכן הוא לא יכול היה להיות שירות בענן.
            </p>
          </blockquote>
        </div>
      </figure>
    </section>
  )
}
