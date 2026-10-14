export interface ParsedBankTransaction {
  date: Date
  originalDescription: string
  description: string
  debit: number
  credit: number
  balance: number
  note: string
  sourceFile: string
}

export interface ParsedCCTransaction {
  transactionDate: Date
  billingDate: Date
  originalMerchantName: string
  merchantName: string
  category: string
  chargedAmount: number
  originalAmount: number
  originalCurrency: string
  cardLastFour: string
  transactionType: string
  notes: string
  /** MAPPED: read through a column mapping (lib/import/mapping.ts) */
  cardProvider: 'MAX' | 'HITECH' | 'MAPPED'
}

export interface ParseResult<T> {
  transactions: T[]
  errors: string[]
}
