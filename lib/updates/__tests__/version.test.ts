import { describe, expect, it } from 'vitest'
import { isNewer, parseRelease, parseVersion } from '../version'

const release = {
  tag_name: 'v1.18.0',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/JordanYefet/Tazrim/releases/tag/v1.18.0',
  published_at: '2026-11-13T11:20:28Z',
  body: "## What's Changed\n* feat: Fake thing by @someone in https://github.com/x/y/pull/1\n* fix: Other fake thing",
}

describe('parseVersion', () => {
  it('accepts 1.2.3 and v1.2.3', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3])
    expect(parseVersion('v1.2.3')).toEqual([1, 2, 3])
  })
  it('rejects anything else', () => {
    expect(parseVersion('latest')).toBeNull()
    expect(parseVersion('1.2')).toBeNull()
  })
})

describe('isNewer', () => {
  it('compares numerically, not as text', () => {
    expect(isNewer('1.18.0', '1.9.9')).toBe(true)
    expect(isNewer('1.2.0', '1.2.0')).toBe(false)
    expect(isNewer('1.2.0', '1.10.0')).toBe(false)
  })
  it('is false when either side is unparsable', () => {
    expect(isNewer('x', '1.0.0')).toBe(false)
    expect(isNewer('1.0.0', 'x')).toBe(false)
  })
})

describe('parseRelease', () => {
  it('reads version, link, date and tidy notes', () => {
    expect(parseRelease(release)).toEqual({
      version: '1.18.0',
      url: release.html_url,
      notes: ['Fake thing', 'Other fake thing'],
      publishedAt: release.published_at,
    })
  })
  it('skips drafts, prereleases and odd tags', () => {
    expect(parseRelease({ ...release, draft: true })).toBeNull()
    expect(parseRelease({ ...release, prerelease: true })).toBeNull()
    expect(parseRelease({ ...release, tag_name: 'latest' })).toBeNull()
    expect(parseRelease(null)).toBeNull()
    expect(parseRelease('x')).toBeNull()
  })
  it('keeps at most 5 notes of at most 140 characters, with scopes and links removed', () => {
    const body = [1, 2, 3, 4, 5, 6].map(n => `- fix(ui)!: Note ${n} [link](https://x.y/z) ${'a'.repeat(200)}`).join('\n')
    const r = parseRelease({ ...release, body })!
    expect(r.notes).toHaveLength(5)
    expect(r.notes.every(n => n.length <= 140)).toBe(true)
    expect(r.notes[0].startsWith('Note 1 link')).toBe(true)
  })
  it('copes with a missing body', () => {
    expect(parseRelease({ ...release, body: null })?.notes).toEqual([])
  })
})
