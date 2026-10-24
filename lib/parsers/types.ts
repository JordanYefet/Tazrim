export interface ParsedBankTransaction {
  date: Date
  originalDescription: string
  description: string
  debit: number
  credit: number
  balance: number
  note: string
  /** The bank's reference (אסמכתא); '' when the file has none */
  reference?: string
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
  /** The currency the card charged in; ₪ when the file doesn't say */
  chargedCurrency?: string
  /** The issuer's transaction id (Isracard's voucher number); '' when the file has none */
  reference?: string
  cardLastFour: string
  transactionType: string
  notes: string
  /** MAPPED: read through a column mapping (lib/import/mapping.ts) */
  cardProvider: 'MAX' | 'HITECH' | 'MAPPED'
}

export interface ParseResult<T> {
  transactions: T[]
  errors: string[]
  /** Rows left out because they are not billed yet (Max's pending sheet) */
  pending?: number
}
