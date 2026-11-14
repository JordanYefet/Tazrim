import { describe, expect, it, vi } from 'vitest'
import { changePeriod } from '../header'

// A month change on a period page: the new period is remembered inside the transition, so the
// links that follow it (the tab bar's, which fetch their pages ahead) change only with the new
// page, not before it, when their fetches would compete with the page's own.

function setup(pathname: string) {
  const calls: string[] = []
  let inTransition = false
  const deps = {
    pathname,
    params: new URLSearchParams('year=2030&month=4&view=list'),
    remember: vi.fn(() => calls.push(inTransition ? 'remember (in transition)' : 'remember (at once)')),
    show: vi.fn(() => calls.push('show')),
    push: vi.fn((href: string) => calls.push(`push ${href}`)),
    startPeriod: (fn: () => void) => {
      inTransition = true
      fn()
      inTransition = false
    },
  }
  return { deps, calls }
}

describe('changePeriod', () => {
  it('on a period page: remembers inside the transition, with the optimistic picker and the push', () => {
    const { deps, calls } = setup('/')
    changePeriod({ year: 2030, month: 3 }, deps)
    expect(calls).toEqual(['show', 'remember (in transition)', 'push /?year=2030&month=3&view=list'])
  })

  it('on a page without a period: remembers at once and keeps the URL', () => {
    const { deps, calls } = setup('/settings')
    changePeriod({ year: 2030 }, deps)
    expect(calls).toEqual(['remember (at once)'])
    expect(deps.push).not.toHaveBeenCalled()
  })
})
