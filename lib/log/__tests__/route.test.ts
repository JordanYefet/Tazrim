import { beforeEach, describe, expect, it } from 'vitest'
import { entriesAfter, resetLog } from '../buffer'
import { CAPTURE_MAX, capped, logged, maskValues, routeName } from '../route'
import { MASK } from '../redact'

const json = (path: string, body: unknown, method = 'POST') =>
  new Request(`http://localhost:3000${path}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ok = (status = 200, body: unknown = { ok: true }) => async (_r?: Request) => Response.json(body, { status })
const last = () => entriesAfter().at(-1)!
const dump = () => JSON.stringify(entriesAfter())

beforeEach(resetLog)

describe('logged: the line', () => {
  it('shows method, path, status and time; ids as :id; the query kept and redacted', async () => {
    await logged(ok(201))(json('/api/categories/cat123abcdef?year=2026&id=999', { name: 'מזון' }))
    expect(last().msg).toMatch(/^POST \/api\/categories\/:id\?year=2026&id=•••• → 201 · \d+ms$/)
    expect(last().level).toBe('info')
    expect(last().data).toMatchObject({ route: 'POST /api/categories/:id', status: 201, query: { year: '2026', id: MASK } })
  })
  it('warn for 4xx, error for 5xx and for a throw (which is thrown again)', async () => {
    await logged(ok(404))(json('/api/x', {}))
    expect(last().level).toBe('warn')
    await logged(ok(500))(json('/api/x', {}))
    expect(last().level).toBe('error')
    await expect(logged(async (_r: Request) => { throw new Error('boom') })(json('/api/x', { a: 1 }))).rejects.toThrow('boom')
    expect(last()).toMatchObject({ level: 'error', data: { status: 500, body: { a: 1 } } })
    expect(last().msg).toContain('threw')
  })
  it('a handler called with no request still works', async () => {
    const res = await logged(() => Response.json({ ok: 1 }))()
    expect(res.status).toBe(200)
    expect(entriesAfter()).toHaveLength(0)
  })
  it('routeName', () => {
    expect(routeName('/api/a/abc123def456/b')).toBe('/api/a/:id/b')
  })
})

describe('logged: the body', () => {
  it('JSON is parsed and redacted, and the handler can still read its own copy', async () => {
    let seen: unknown
    const req = json('/api/aliases', { name: 'Shop', note: 'mail a@b.test', nested: { deep: [1, 2] } })
    await logged(async (r: Request) => { seen = await r.json(); return Response.json({ ok: true }) })(req)
    expect(seen).toEqual({ name: 'Shop', note: 'mail a@b.test', nested: { deep: [1, 2] } })
    expect(last().data?.body).toEqual({ name: 'Shop', note: `mail ${MASK}`, nested: { deep: [1, 2] } })
  })
  it('multipart: field names, and a file as name, type and size only', async () => {
    const form = new FormData()
    form.set('month', '3')
    form.set('file', new File(['secret,contents\n1,2'], 'bank.csv', { type: 'text/csv' }))
    let sizeSeen = 0
    await logged(async (r: Request) => { sizeSeen = ((await r.formData()).get('file') as File).size; return Response.json({}) })(new Request('http://localhost:3000/api/upload', { method: 'POST', body: form }))
    expect(sizeSeen).toBe(19)
    expect(last().data?.body).toEqual({ month: '3', file: { file: 'bank.csv', type: 'text/csv', size: 19 } })
    expect(dump()).not.toContain('secret,contents')
  })
  it('other types: content type and byte count only', async () => {
    await logged(ok())(new Request('http://localhost:3000/api/x', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello there' }))
    expect(last().data?.body).toEqual({ contentType: 'text/plain', bytes: 11 })
    expect(dump()).not.toContain('hello there')
  })
  it('an empty body, and a GET, have no body field', async () => {
    await logged(ok())(new Request('http://localhost:3000/api/x', { method: 'POST' }))
    expect(last().data).not.toHaveProperty('body')
    await logged(ok())(new Request('http://localhost:3000/api/x?q=1'))
    expect(last().data).not.toHaveProperty('body')
    expect(last().data).toMatchObject({ query: { q: '1' } })
  })
  it('a body over the cap is cut to a marker with the start of it', async () => {
    await logged(ok())(json('/api/x', { items: Array.from({ length: 50 }, (_, i) => ({ text: `row ${i} `.repeat(40) })) }))
    const body = last().data?.body as { truncated: boolean; size: number; preview: string }
    expect(body.truncated).toBe(true)
    expect(body.size).toBeGreaterThan(CAPTURE_MAX)
    expect(JSON.stringify(body).length).toBeLessThan(1000)
    expect(capped({ a: 1 })).toEqual({ a: 1 })
  })
  it('invalid JSON does not break the request', async () => {
    const res = await logged(ok())(new Request('http://localhost:3000/api/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' }))
    expect(res.status).toBe(200)
    expect(last().data?.body).toMatchObject({ invalidJson: true })
  })
})

describe('logged: the response', () => {
  it('an error response body is shown, redacted, and the caller can still read it', async () => {
    const res = await logged(ok(400, { error: 'שגיאה', code: 'INVALID', token: 'abc' }))(json('/api/x', {}))
    expect(last().data?.response).toEqual({ error: 'שגיאה', code: 'INVALID', token: MASK })
    expect(await res.json()).toMatchObject({ code: 'INVALID' })
  })
  it('a success body is never read', async () => {
    let read = false
    const res = Response.json({ big: 1 })
    const orig = res.clone.bind(res)
    res.clone = () => { read = true; return orig() }
    await logged(async (_r: Request) => res)(json('/api/x', {}))
    expect(read).toBe(false)
    expect(last().data).not.toHaveProperty('response')
  })
  it('a streaming error response is left alone', async () => {
    const res = new Response('data: x\n\n', { status: 500, headers: { 'content-type': 'text/event-stream' } })
    await logged(async (_r: Request) => res)(json('/api/x', {}))
    expect(last().data).not.toHaveProperty('response')
    expect(await res.text()).toBe('data: x\n\n')
  })
})

describe('logged: sensitive routes keep keys only', () => {
  const secrets = ['hunter2', '123456789', '987654', 'my-passkey-assertion']
  const routes = ['/api/auth/password', '/api/auth/login', '/api/vault/logins', '/api/vault/logins/cat123abcdef', '/api/people/password', '/api/people/recovery', '/api/people/passkeys/abc12345678', '/api/data/delete-all']
  it.each(routes)('%s', async path => {
    const body = { password: 'hunter2', id: '123456789', userCode: '987654', company: 'leumi', response: { id: 'my-passkey-assertion', nested: [{ k: 'hunter2' }] } }
    await logged(ok(401, { error: 'hunter2 wrong', code: 'NO' }))(json(`${path}?token=hunter2`, body))
    expect(last().data?.body).toEqual({
      password: MASK, id: MASK, userCode: MASK, company: MASK,
      response: { id: MASK, nested: [{ k: MASK }] },
    })
    expect(last().data?.query).toEqual({ token: MASK })
    const text = dump()
    for (const s of secrets) expect(text.replace('hunter2 wrong', '')).not.toContain(s)
  })
  it('a form on a sensitive route masks values and shows no file details', async () => {
    const form = new FormData()
    form.set('password', 'hunter2')
    form.set('f', new File(['x'], 'key.txt'))
    await logged(ok())(new Request('http://localhost:3000/api/vault/reset', { method: 'POST', body: form }))
    expect(last().data?.body).toEqual({ password: MASK, f: MASK })
  })
  it('maskValues keeps the shape and drops every value', () => {
    expect(maskValues({ a: 'x', b: [1, { c: true }], d: null })).toEqual({ a: MASK, b: [MASK, { c: MASK }], d: MASK })
  })
  it('a non-sensitive route keeps values (redacted)', async () => {
    await logged(ok())(json('/api/categories', { name: 'מזון' }))
    expect(last().data?.body).toEqual({ name: 'מזון' })
  })
})
