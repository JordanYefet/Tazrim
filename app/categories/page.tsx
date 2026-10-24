import { CategoryList } from '@/components/categories/category-list'
import { MerchantMappings } from '@/components/categories/merchant-mappings'
import { IssuerCategories } from '@/components/categories/issuer-categories'
import { getCategories } from '@/lib/db/categories'
import { getAliases } from '@/lib/db/aliases'
import { getIssuerCategories } from '@/lib/db/category-mappings'
import { asJson } from '@/lib/db/summary'

async function getData() {
  const [expense, income, aliases, issuer] = await Promise.all([
    getCategories('EXPENSE'),
    getCategories('INCOME'),
    getAliases(),
    getIssuerCategories(),
  ])
  return { expense: asJson(expense), income: asJson(income), aliases: asJson(aliases), issuer }
}

export default async function CategoriesPage() {
  const { expense, income, aliases, issuer } = await getData()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">קטגוריות ומיפויי עסקים</h1>

      <section className="space-y-4 rounded-xl surface p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">קטגוריות הוצאה</h2>
          <p className="text-sm text-muted-foreground">לחיובי כרטיסי האשראי ולתנועות יוצאות בבנק</p>
        </div>
        <CategoryList initial={expense} kind="EXPENSE" />
      </section>

      <section className="space-y-4 rounded-xl surface p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">קטגוריות מחברות האשראי</h2>
          <p className="text-sm text-muted-foreground">
            הקטגוריות שהגיעו בקבצים של חברות האשראי. בחר לכל אחת קטגוריה מהרשימה שלך, וכל העסקאות שלה, גם בקבצים הבאים, יקבלו אותה.
          </p>
        </div>
        <IssuerCategories initial={issuer} categories={expense} />
      </section>

      <section className="space-y-4 rounded-xl surface p-4 sm:p-6">
        <div>
          <h2 className="text-base font-semibold">קטגוריות הכנסה</h2>
          <p className="text-sm text-muted-foreground">לתנועות נכנסות בבנק, כמו משכורת או שכר דירה שמתקבל</p>
        </div>
        <CategoryList initial={income} kind="INCOME" />
      </section>

      <section className="space-y-4 rounded-xl surface p-4 sm:p-6">
        <h2 className="text-base font-semibold">מיפויי עסקים</h2>
        <MerchantMappings initial={aliases} categories={expense} />
      </section>
    </div>
  )
}
