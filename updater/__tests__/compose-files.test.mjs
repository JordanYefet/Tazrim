import { describe, expect, it } from 'vitest'
import { GITHUB_API } from '../latest.mjs'
import { decide, fetchReleaseFile, MAX_DIFF_LINES, MAX_FILE_BYTES, parseRecord, renderRecord, sha256, unifiedDiff, updateChange } from '../compose-files.mjs'

const raw = (text, status = 200, headers = {}) => Promise.resolve(new Response(text, { status, headers }))

describe('fetchReleaseFile', () => {
  it('asks the contents API for the file at the release tag, with the raw media type and the helper User-Agent', async () => {
    const calls = []
    const r = await fetchReleaseFile({ version: '1.20.0', name: 'docker-compose.yml', helperVersion: '9.9.9', fetchImpl: (u, i) => (calls.push([u, i]), raw('services: {}\n')) })
    expect(r).toEqual({ text: 'services: {}\n' })
    expect(calls[0][0]).toBe(`${GITHUB_API}/contents/docker-compose.yml?ref=v1.20.0`)
    expect(calls[0][0]).toBe('https://api.github.com/repos/JordanYefet/Tazrim/contents/docker-compose.yml?ref=v1.20.0')
    expect(calls[0][1].headers).toEqual({ 'User-Agent': 'Tazrim-updater/9.9.9', Accept: 'application/vnd.github.raw' })
  })

  it('404 means the file is not in that release', async () => {
    expect(await fetchReleaseFile({ version: '1.2.3', name: 'docker-compose.egress.yml', fetchImpl: () => raw('{}', 404) })).toEqual({ none: true })
  })

  it('any other failure is COMPOSE_FETCH_FAILED: 403, 500, a network error, a hang', async () => {
    const code = async fetchImpl => {
      try {
        await fetchReleaseFile({ version: '1.2.3', name: 'docker-compose.yml', fetchImpl, timeoutMs: 20 })
      } catch (e) {
        return e.code
      }
    }
    expect(await code(() => raw('', 403))).toBe('COMPOSE_FETCH_FAILED')
    expect(await code(() => raw('', 500))).toBe('COMPOSE_FETCH_FAILED')
    expect(await code(() => Promise.reject(new Error('refused')))).toBe('COMPOSE_FETCH_FAILED')
    expect(await code(() => new Promise(() => {}))).toBe('COMPOSE_FETCH_FAILED')
  })

  it('refuses a file above 256 KB, by its declared size or by what actually arrives', async () => {
    const big = 'x'.repeat(MAX_FILE_BYTES + 1)
    await expect(fetchReleaseFile({ version: '1.2.3', name: 'docker-compose.yml', fetchImpl: () => raw(big) })).rejects.toMatchObject({ code: 'COMPOSE_FETCH_FAILED' })
    await expect(
      fetchReleaseFile({ version: '1.2.3', name: 'docker-compose.yml', fetchImpl: () => raw('x', 200, { 'content-length': String(MAX_FILE_BYTES + 1) }) })
    ).rejects.toMatchObject({ code: 'COMPOSE_FETCH_FAILED' })
    expect((await fetchReleaseFile({ version: '1.2.3', name: 'docker-compose.yml', fetchImpl: () => raw('x'.repeat(MAX_FILE_BYTES)) })).text).toHaveLength(MAX_FILE_BYTES)
  })

  it('never builds a ref from anything but x.y.z and a managed name: nothing is fetched', async () => {
    let fetched = 0
    const fetchImpl = () => (fetched++, raw('x'))
    for (const version of ['1.2', 'v1.2.3', '1.2.3-rc.1', '1.2.3/../x', 'latest', '', null, undefined, 123]) {
      await expect(fetchReleaseFile({ version, name: 'docker-compose.yml', fetchImpl })).rejects.toMatchObject({ code: 'COMPOSE_FETCH_FAILED' })
    }
    for (const name of ['.env', '../.env', 'docker-compose.override.yml', 'docker-compose.yml?ref=main']) {
      await expect(fetchReleaseFile({ version: '1.2.3', name, fetchImpl })).rejects.toMatchObject({ code: 'COMPOSE_FETCH_FAILED' })
    }
    expect(fetched).toBe(0)
  })
})

describe('decide', () => {
  const A = 'a\n'
  const B = 'b\n'
  const C = 'c\n'
  const d = (o, name = 'docker-compose.yml') => decide({ name, local: A, next: B, recorded: undefined, base: null, ...o })

  it('the file is not in the release: skip', () => {
    expect(d({ next: null })).toBe('skip')
    expect(d({ next: null, local: null })).toBe('skip')
  })
  it('local equals the release: same', () => {
    expect(d({ local: B })).toBe('same')
  })
  it('local missing: skip, also for the egress file (isolation brings it when it turns on)', () => {
    expect(d({ local: null }, 'docker-compose.egress.yml')).toBe('skip')
    expect(d({ local: null }, 'docker-compose.yml')).toBe('skip')
  })
  it('with a record: replace when the local hash is the recorded one, edited otherwise', () => {
    expect(d({ recorded: sha256(A) })).toBe('replace')
    expect(d({ recorded: sha256(C) })).toBe('edited')
    // the record wins over the current tag's file
    expect(d({ recorded: sha256(C), base: A })).toBe('edited')
  })
  it('without a record: replace when local is the current release file, edited otherwise', () => {
    expect(d({ base: A })).toBe('replace')
    expect(d({ base: C })).toBe('edited')
  })
  it('without a record and without the current release file (fetch failed, or not there): edited', () => {
    expect(d({ base: null })).toBe('edited')
    expect(d({ base: undefined })).toBe('edited')
  })
})

describe('the record', () => {
  it('reads known names with a sha256 and ignores everything else', () => {
    const h = sha256('x')
    expect(parseRecord(renderRecord({ 'docker-compose.yml': h }))).toEqual({ 'docker-compose.yml': h })
    expect(parseRecord(JSON.stringify({ files: { 'docker-compose.yml': h, '.env': h, 'docker-compose.egress.yml': 'nope' } }))).toEqual({ 'docker-compose.yml': h })
    for (const bad of ['', 'not json', 'null', '[]', '{"files":[]}', null]) expect(parseRecord(bad)).toEqual({})
  })
})

describe('unifiedDiff', () => {
  it('identical texts give no diff', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n')).toEqual({ diff: '', truncated: false })
  })

  it('an insert, with context', () => {
    const from = ['1', '2', '3', '4', '5', '6', '7', '8'].join('\n') + '\n'
    const to = ['1', '2', '3', '4', 'new', '5', '6', '7', '8'].join('\n') + '\n'
    expect(unifiedDiff(from, to).diff).toBe(['@@ -2,6 +2,7 @@', ' 2', ' 3', ' 4', '+new', ' 5', ' 6', ' 7'].join('\n'))
  })

  it('a delete and a change', () => {
    expect(unifiedDiff('a\nb\nc\n', 'a\nc\n').diff).toBe(['@@ -1,3 +1,2 @@', ' a', '-b', ' c'].join('\n'))
    expect(unifiedDiff('a\nb\nc\n', 'a\nB\nc\n').diff).toBe(['@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'].join('\n'))
  })

  it('far apart changes make two hunks', () => {
    const base = Array.from({ length: 30 }, (_, i) => `line${i}`)
    const changed = base.map((l, i) => (i === 2 || i === 25 ? `${l}!` : l))
    const d = unifiedDiff(base.join('\n') + '\n', changed.join('\n') + '\n').diff
    expect(d.match(/^@@/gm)).toHaveLength(2)
  })

  it('a new file is all additions', () => {
    expect(unifiedDiff('', 'x\ny\n').diff).toBe(['@@ -0,0 +1,2 @@', '+x', '+y'].join('\n'))
  })

  it('is cut at 400 lines and says so', () => {
    const to = Array.from({ length: 1000 }, (_, i) => `line${i}`).join('\n') + '\n'
    const r = unifiedDiff('', to)
    expect(r.truncated).toBe(true)
    expect(r.diff.split('\n')).toHaveLength(MAX_DIFF_LINES)
    expect(unifiedDiff('', 'a\n').truncated).toBe(false)
  })

  it('two completely different big files still finish (no giant table)', () => {
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`).join('\n')
    const b = Array.from({ length: 3000 }, (_, i) => `b${i}`).join('\n')
    expect(unifiedDiff(a, b).truncated).toBe(true)
  })
})

describe('updateChange', () => {
  const h = sha256('x')
  it('has one shape: sorted names, checked hashes', () => {
    const a = updateChange('1.2.3', { 'docker-compose.yml': h, 'docker-compose.egress.yml': h })
    expect(JSON.stringify(a)).toBe(JSON.stringify({ action: 'update-compose', version: '1.2.3', files: { 'docker-compose.egress.yml': h, 'docker-compose.yml': h } }))
    expect(JSON.stringify(updateChange('1.2.3', { 'docker-compose.egress.yml': h, 'docker-compose.yml': h }))).toBe(JSON.stringify(a))
  })
  it('refuses anything else', () => {
    expect(updateChange('1.2', { 'docker-compose.yml': h })).toBeNull()
    expect(updateChange('1.2.3', {})).toBeNull()
    expect(updateChange('1.2.3', { '.env': h })).toBeNull()
    expect(updateChange('1.2.3', { 'docker-compose.yml': 'abc' })).toBeNull()
    expect(updateChange('1.2.3', null)).toBeNull()
  })
})
