import { CategoryList } from '@/components/categories/category-list'
import { MerchantMappings } from '@/components/categories/merchant-mappings'
import { getCategories } from '@/lib/db/categories'
import { getAliases } from '@/lib/db/aliases'
import { asJson } from '@/lib/db/summary'

async function getData() {
  const [categories, aliases] = await Promise.all([getCategories(), getAliases()])
  return { categories: asJson(categories), aliases: asJson(aliases) }
}

export default async function CategoriesPage() {
  const { categories, aliases } = await getData()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">קטגוריות ומיפויי עסקים</h1>

      <section className="space-y-4 rounded-xl surface p-4 sm:p-6">
        <h2 className="text-base font-semibold">ניהול קטגוריות</h2>
        <CategoryList initial={categories} />
      </section>

      <section className="space-y-4 rounded-xl surface p-4 sm:p-6">
        <h2 className="text-base font-semibold">מיפויי עסקים</h2>
        <MerchantMappings initial={aliases} categories={categories} />
      </section>
    </div>
  )
}
