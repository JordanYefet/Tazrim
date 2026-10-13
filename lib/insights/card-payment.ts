// Recognises the bank's monthly payment to a credit-card company. Shared by the
// recurring (ENG-37) and unusual (ENG-38) detectors so both treat the same rows
// as the card payment: card charges are a breakdown of that debit, never extra
// spending (see ENG-3).

// Short names need word boundaries (JS \b doesn't work for Hebrew); long ones
// are matched anywhere.
const B = `(^|[\\s\\-"'()])`
const E = `($|[\\s\\-"'()])`
const CARD_PAYMENT = new RegExp(
  [
    'מקס איט', 'כרטיסי אשראי', 'כרטיס אשראי', 'ישראכרט', 'מאסטרקרד', 'לאומי קארד', 'אמריקן אקספרס', 'דיינרס',
    `${B}(מקס|כאל|ויזה)${E}`,
    `${B}(max|max it|cal|isracard|mastercard|visa|amex|american express|diners)${E}`,
  ].join('|'),
  'i'
)

/** True for bank rows that are the monthly payment to a credit-card company */
export function isCardPaymentDescription(description: string): boolean {
  return CARD_PAYMENT.test(description.normalize('NFKC'))
}
