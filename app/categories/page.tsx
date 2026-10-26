import { CategoryList } from '@/components/categories/category-list'
import { MerchantMappings } from '@/components/categories/merchant-mappings'
import { IssuerCategories } from '@/components/categories/issuer-categories'
import { GenericDescriptions } from '@/components/categories/generic-descriptions'
import { RuleSection } from '@/components/categories/rule-section'
import { getCategories } from '@/lib/db/categories'
import { getAliases } from '@/lib/db/aliases'
import { getIssuerCategories } from '@/lib/db/category-mappings'
import { listGenericDescriptions } from '@/lib/db/generic-descriptions'
import { asJson } from '@/lib/db/summary'

async function getData() {
  const [expense, income, aliases, issuer, generic] = await Promise.all([
    getCategories('EXPENSE'),
    getCategories('INCOME'),
    getAliases(),
    getIssuerCategories(),
    listGenericDescriptions(),
  ])
  return { expense: asJson(expense), income: asJson(income), aliases: asJson(aliases), issuer, generic }
}

/**
 * Two parts: the user's own categories, always open, and the ways transactions get
 * one automatically, each a closed row with a one-line summary.
 */
export default async function CategoriesPage() {
  const { expense, income, aliases, issuer, generic } = await getData()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">קטגוריות ומיפויים</h1>

      <section className="space-y-4 rounded-xl surface p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">הקטגוריות שלי</h2>
          <p className="text-sm text-muted-foreground">הרשימה שממנה בוחרים קטגוריה לכל תנועה ולכל חיוב</p>
        </div>
        {/* Expense and income side by side in one card, so a name is easy to check before adding it */}
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-4">
          <span className="pt-1.5 text-sm font-semibold text-muted-foreground">הוצאה</span>
          <CategoryList initial={expense} kind="EXPENSE" />
          <span className="pt-1.5 text-sm font-semibold text-muted-foreground">הכנסה</span>
          <CategoryList initial={income} kind="INCOME" />
        </div>
      </section>

      <section className="overflow-hidden rounded-xl surface">
        <div className="px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
          <h2 className="text-base font-semibold">שיוך אוטומטי</h2>
          <p className="text-sm text-muted-foreground">איך תנועות מקבלות קטגוריה בלי שתבחר בעצמך</p>
        </div>
        <RuleSection
          id="issuer"
          title="קטגוריות מחברות האשראי"
          summary="הקטגוריה בקובץ של חברת האשראי ← הקטגוריה שלך, לכל העסקאות שלה, גם בקבצים הבאים"
          count={issuer.length}
        >
          <IssuerCategories initial={issuer} categories={expense} />
        </RuleSection>
        <RuleSection
          id="merchants"
          title="בתי עסק"
          summary="שם מוצג וקטגוריה לבית עסק מסוים; גוברים על הקטגוריה של חברת האשראי"
          count={aliases.length}
        >
          <MerchantMappings initial={aliases} categories={expense} />
        </RuleSection>
        <RuleSection
          id="generic"
          title="תיאורים כלליים"
          summary="תיאורים בבנק כמו שיק או העברה, שלא אומרים למי: קטגוריה נבחרת לכל תנועה בנפרד"
          count={generic.length}
        >
          <p className="mb-3 text-sm text-muted-foreground">
            הוספת תיאור מבטלת את הכללים שנשמרו לו ומנקה את הקטגוריות שהם נתנו; קטגוריה שנבחרה ידנית נשארת.
          </p>
          <GenericDescriptions initial={generic} />
        </RuleSection>
      </section>
    </div>
  )
}
