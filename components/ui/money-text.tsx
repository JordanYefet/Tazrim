import { Fragment, type ReactNode } from 'react'

// Direction marks the Hebrew number format puts around the sign and the ₪
const MARKS = '\\u200e\\u200f'
const NUMBER = '\\d[\\d,]*(?:\\.\\d+)?'

/**
 * An amount inside a sentence: a shekel amount as lib/utils/currency.ts writes it (an
 * optional sign, the digits, then ₪, with direction marks and a no-break space), "₪120"
 * written by hand, and a card row's foreign amount ("12.5 USD", "$12.5").
 */
const AMOUNT = new RegExp(
  [
    `[${MARKS}]*[+\\-−]?[${MARKS}]*${NUMBER}[\\s\\u00a0${MARKS}]*₪`,
    `₪[\\s\\u00a0]?${NUMBER}`,
    `[+\\-−]?${NUMBER}[\\s\\u00a0]?(?:[A-Z]{3}\\b|[$€£])`,
    `[$€£][\\s\\u00a0]?${NUMBER}`,
  ].join('|'),
  'g'
)

/** The text split into plain parts and amounts, in order. Exported for tests. */
export function splitAmounts(text: string): { text: string; money: boolean }[] {
  const parts: { text: string; money: boolean }[] = []
  let last = 0
  for (const m of text.matchAll(AMOUNT)) {
    const at = m.index ?? 0
    if (at > last) parts.push({ text: text.slice(last, at), money: false })
    parts.push({ text: m[0], money: true })
    last = at + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), money: false })
  return parts
}

/**
 * A sentence with amounts in it ("ממוצע חודשי 21,287 ₪"): each amount carries data-money,
 * so privacy mode (ENG-127) blurs the amount and leaves the words readable.
 */
export function MoneyText({ children }: { children: ReactNode }): ReactNode {
  if (typeof children !== 'string') return children
  return splitAmounts(children).map((p, i) =>
    p.money ? (
      <span key={i} data-money>
        {p.text}
      </span>
    ) : (
      <Fragment key={i}>{p.text}</Fragment>
    )
  )
}
