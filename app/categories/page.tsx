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
    <div className="max-w-3xl mx-auto space-y-10">
      <h1 className="text-2xl font-bold">קטגוריות ומיפויי עסקים</h1>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-lg">ניהול קטגוריות</h2>
        <CategoryList initial={categories} />
      </section>

      <section className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="font-semibold text-lg">מיפויי עסקים</h2>
        <MerchantMappings initial={aliases} categories={categories} />
      </section>
    </div>
  )
}
