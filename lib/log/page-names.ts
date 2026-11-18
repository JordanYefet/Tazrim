/**
 * The name of an action in the debug log's grouped view, for a page change: "מעבר לדף כרטיסים".
 * The page names are the app's own nav labels (components/layout/sidebar.tsx, bottom-nav.tsx).
 */

const PAGES: [prefix: string, name: string][] = [
  ['/banks', 'בנקים'],
  ['/cards', 'כרטיסים'],
  ['/categories', 'קטגוריות'],
  ['/projection', 'תחזית'],
  ['/recurring', 'קבועים'],
  ['/insights', 'תובנות'],
  ['/upload', 'העלאת קבצים'],
  ['/search', 'חיפוש'],
  ['/accounts', 'חשבונות'],
  ['/about', 'אודות'],
  ['/settings/debug', 'הגדרות דיבאג'],
  ['/settings', 'הגדרות'],
]

/** Null for a page that is not an action worth a line: the logs themselves */
export function actionLabel(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === '/logs' || path.startsWith('/logs/')) return null
  if (path === '/') return 'מעבר לדף ראשי'
  const hit = PAGES.find(([p]) => path === p || path.startsWith(`${p}/`))
  return `מעבר לדף ${hit ? hit[1] : path}`
}
