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
  cardProvider: 'MAX' | 'HITECH'
}

export interface ParseResult<T> {
  transactions: T[]
  errors: string[]
}
