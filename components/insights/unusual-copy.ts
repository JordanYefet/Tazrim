import type { UnusualFlag } from '@/lib/insights/unusual'
import { formatCurrencyWhole } from '@/lib/utils/currency'

/** Short Hebrew label for a badge */
export function unusualFlagLabel(flag: UnusualFlag): string {
  switch (flag.reason) {
    case 'merchant_outlier':
      return 'חריג לבית העסק'
    case 'category_outlier':
      return 'חריג לקטגוריה'
    case 'possible_duplicate':
      return 'חיוב כפול?'
  }
}

/** One-line Hebrew explanation with the numbers behind the flag */
export function unusualFlagDetail(flag: UnusualFlag): string {
  switch (flag.reason) {
    case 'merchant_outlier':
      return `פי ${flag.ratio.toFixed(1)} מהרגיל בבית העסק (בדרך כלל ${formatCurrencyWhole(flag.baseline)}, לפי ${flag.historyCount} חיובים קודמים)`
    case 'category_outlier':
      return `פי ${flag.ratio.toFixed(1)} מהרגיל בקטגוריה ${flag.category} (בדרך כלל ${formatCurrencyWhole(flag.baseline)})`
    case 'possible_duplicate': {
      const when =
        flag.daysApart === 0 ? 'באותו יום' : flag.daysApart === 1 ? 'יום קודם' : `לפני ${flag.daysApart} ימים`
      return `אותו סכום באותו בית עסק ${when}`
    }
  }
}
