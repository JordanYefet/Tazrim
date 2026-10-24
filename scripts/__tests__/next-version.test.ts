import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// .github/scripts/next-version.sh, run in throwaway git repos with made-up tags
const SCRIPT = path.resolve(__dirname, '../../.github/scripts/next-version.sh')
const dirs: string[] = []

function repoWith(tags: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'next-version-'))
  dirs.push(dir)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('init', '-q')
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'x')
  for (const t of tags) git('tag', t)
  return dir
}
const next = (dir: string, bump: string) => execFileSync('bash', [SCRIPT, bump], { cwd: dir }).toString().trim()

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('next-version.sh', () => {
  it('bumps the newest release by the kind of release', () => {
    const dir = repoWith(['v1.0.0', 'v1.4.2'])
    expect(next(dir, 'patch')).toBe('1.4.3')
    expect(next(dir, 'minor')).toBe('1.5.0')
    expect(next(dir, 'major')).toBe('2.0.0')
  })

  it('finds the newest by version order, not by name, and ignores other tags', () => {
    const dir = repoWith(['v1.9.0', 'v1.10.0', 'v1.2.30', 'demo-tag', 'v2.0.0-beta', 'release'])
    expect(next(dir, 'patch')).toBe('1.10.1')
  })

  it('starts at 1.0.0 when there is no release yet', () => {
    expect(next(repoWith([]), 'minor')).toBe('1.0.0')
  })

  it('refuses anything but patch, minor or major', () => {
    const dir = repoWith(['v1.0.0'])
    expect(() => execFileSync('bash', [SCRIPT, 'huge'], { cwd: dir, stdio: 'pipe' })).toThrow()
  })
})
