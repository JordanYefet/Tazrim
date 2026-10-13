import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MissingStatementsBanner } from '../missing-statements-banner'
import { AccountPicker, type UploadAccount } from '@/components/upload/account-picker'

// Made-up accounts and months only.
describe('MissingStatementsBanner', () => {
  it('lists each provider with its missing months and links to /upload', () => {
    const html = renderToStaticMarkup(
      <MissingStatementsBanner
        items={[
          { kind: 'CREDIT_CARD', provider: 'max', months: ['2030-07', '2030-08', '2030-09'] },
          { kind: 'BANK', provider: 'leumi', months: ['2030-03'] },
        ]}
      />
    )
    expect(html).toContain('אין פירוט מקס עבור יולי–ספטמבר 2030')
    expect(html).toContain('חסרות תנועות לאומי עבור מרץ 2030')
    expect(html).toContain('href="/upload"')
  })

  it('renders nothing when no statement is missing', () => {
    expect(renderToStaticMarkup(<MissingStatementsBanner items={[]} />)).toBe('')
  })
})

describe('AccountPicker missing months', () => {
  const account = (over: Partial<UploadAccount>): UploadAccount => ({
    id: 'card1',
    kind: 'CREDIT_CARD',
    provider: 'max',
    displayName: 'Fake Card',
    cardLastFour: null,
    ...over,
  })

  it('shows the gap under the account that has one', () => {
    const html = renderToStaticMarkup(
      <AccountPicker
        accounts={[account({ missingMonths: ['2030-12', '2031-01'] }), account({ id: 'card2', displayName: 'Other Card' })]}
        value={null}
        onChange={() => {}}
      />
    )
    expect(html).toContain('חסר: דצמבר 2030–ינואר 2031')
    expect(html.match(/חסר:/g)).toHaveLength(1)
  })
})
