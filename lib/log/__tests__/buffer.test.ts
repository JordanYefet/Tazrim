import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAPACITY, append, clear, entriesAfter, resetLog, stats } from '../buffer'
import { log } from '../logger'
import { MASK } from '../redact'

beforeEach(resetLog)

describe('log buffer', () => {
  it('keeps the last 500 lines', () => {
    for (let i = 0; i < CAPACITY + 25; i++) append('info', 'app', `line ${i}`)
    const all = entriesAfter()
    expect(all).toHaveLength(CAPACITY)
    expect(all[0].msg).toBe('line 25')
    expect(all.at(-1)!.msg).toBe(`line ${CAPACITY + 24}`)
    expect(stats().total).toBe(CAPACITY + 25)
  })

  it('numbers lines upward, and entriesAfter returns only the newer ones', () => {
    const a = append('info', 'app', 'one')
    const b = append('warn', 'sync', 'two')
    expect(b.id).toBeGreaterThan(a.id)
    expect(entriesAfter(a.id).map(e => e.msg)).toEqual(['two'])
    expect(entriesAfter(b.id)).toEqual([])
  })

  it('redacts the message and every field as it is written', () => {
    const e = append('error', 'sync', 'login password=hunter2 for 12345678', { username: 'demo', note: 'mail a@b.test', ms: 40 })
    expect(e.msg).toBe(`login password=${MASK} for ${MASK}`)
    expect(e.data).toEqual({ username: MASK, note: `mail ${MASK}`, ms: 40 })
    expect(JSON.stringify(entriesAfter())).not.toMatch(/hunter2|12345678|a@b\.test/)
  })

  it('clear empties it but ids keep rising', () => {
    const a = append('info', 'app', 'x')
    clear()
    expect(entriesAfter()).toEqual([])
    expect(append('info', 'app', 'y').id).toBeGreaterThan(a.id)
  })
})

describe('logger', () => {
  it('writes to the buffer, and to the console only for warnings and errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    log.info('app', 'quiet')
    log.debug('app', 'quieter')
    log.warn('sync', 'careful token=abc')
    log.error('app', 'broken')
    expect(entriesAfter().map(e => e.level)).toEqual(['info', 'debug', 'warn', 'error'])
    expect(warn).toHaveBeenCalledWith(`[sync] careful token=${MASK}`)
    expect(error).toHaveBeenCalledWith('[app] broken')
    warn.mockRestore()
    error.mockRestore()
  })
})
