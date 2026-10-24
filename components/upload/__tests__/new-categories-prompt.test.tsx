import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ADD, NewCategoriesPrompt, SKIP, planCategoryChoices } from '../new-categories-prompt'

// Made-up category names only.

describe('planCategoryChoices', () => {
  it('splits the choices into categories to add and mappings to yours, leaving skipped ones out', () => {
    const categories = ['מזון בדוי', 'בילוי בדוי', 'שונות בדויות']
    expect(planCategoryChoices(categories, { 'מזון בדוי': ADD, 'בילוי בדוי': 'פנאי שלי', 'שונות בדויות': SKIP })).toEqual({
      add: ['מזון בדוי'],
      map: [{ sourceCategory: 'בילוי בדוי', category: 'פנאי שלי' }],
    })
  })

  it('nothing to save when every category is skipped', () => {
    expect(planCategoryChoices(['א'], { א: SKIP })).toEqual({ add: [], map: [] })
  })
})

describe('NewCategoriesPrompt', () => {
  it('offers each new category, added as new by default', () => {
    const html = renderToStaticMarkup(<NewCategoriesPrompt categories={['מזון בדוי']} provider="max" onDone={() => {}} />)
    expect(html).toContain('מזון בדוי')
    expect(html).toContain('להוסיף כקטגוריה חדשה')
    expect(html).toContain('לא עכשיו')
  })
})
