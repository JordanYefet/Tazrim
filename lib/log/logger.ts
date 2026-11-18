/**
 * The server's logger: a line goes into the debug buffer (lib/log/buffer.ts) and,
 * for warnings and errors, still to the console as before. What reaches either is
 * redacted first, so call it with counts, codes and step names, never with what a
 * bank returned.
 *
 *   log.info('sync', 'leumi · LOGIN_SUCCESS', { run: 3 })
 *
 * info and debug stay out of the console: the buffer is where those are read, and a
 * line per request would bury the container's log.
 */
import { append, type LogLevel, type LogSource } from './buffer'

type Fields = Record<string, unknown>

function write(level: LogLevel, source: LogSource, msg: string, data?: Fields) {
  const entry = append(level, source, msg, data)
  if (level === 'warn') console.warn(`[${source}] ${entry.msg}`)
  else if (level === 'error') console.error(`[${source}] ${entry.msg}`)
}

export const log = {
  debug: (source: LogSource, msg: string, data?: Fields) => write('debug', source, msg, data),
  info: (source: LogSource, msg: string, data?: Fields) => write('info', source, msg, data),
  warn: (source: LogSource, msg: string, data?: Fields) => write('warn', source, msg, data),
  error: (source: LogSource, msg: string, data?: Fields) => write('error', source, msg, data),
}
