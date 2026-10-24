import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// .github/scripts/release-bump.sh and release-prs.sh, with made-up PR titles
const SCRIPTS = path.resolve(__dirname, '../../.github/scripts')
const dirs: string[] = []
const temp = (prefix: string) => {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

const bump = (titles: string[], ...args: string[]) =>
  execFileSync('bash', [path.join(SCRIPTS, 'release-bump.sh'), ...args], { input: titles.join('\n') })
    .toString()
    .trim()

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('release-bump.sh', () => {
  it('only fixes make a patch release', () => {
    expect(bump(['fix: card totals off by one', 'fix(upload): empty rows', 'docs: README typo'])).toBe('patch')
  })

  it('any feature makes a minor release', () => {
    expect(bump(['fix: card totals off by one', 'feat: yearly view', 'chore: bump deps'])).toBe('minor')
    expect(bump(['feat(search): filter by amount'])).toBe('minor')
  })

  it('any ! makes a major release, whatever else is there', () => {
    expect(bump(['feat: yearly view', 'fix!: new database layout', 'fix: typo'])).toBe('major')
    expect(bump(['refactor(db)!: rename tables'])).toBe('major')
  })

  it('a title without a recognised prefix counts as minor', () => {
    expect(bump(['fix: typo', 'Card table: one width for the menus'])).toBe('minor')
    expect(bump(['Fix: capitalised is not a prefix'])).toBe('minor')
    expect(bump(['fix:no space after the colon'])).toBe('minor')
    expect(bump(['fixes: not a type'])).toBe('minor')
  })

  it('no PRs at all gives minor', () => {
    expect(bump([])).toBe('minor')
  })

  it('--each says what every title counted as', () => {
    expect(bump(['fix: a', 'feat!: b', 'something else'], '--each').split('\n')).toEqual([
      'patch\tfix: a',
      'major\tfeat!: b',
      'minor (no prefix)\tsomething else',
    ])
  })
})

describe('release-prs.sh', () => {
  // A throwaway repo whose main has merge and squash commits around a release tag, and a fake `gh`
  function setup() {
    const dir = temp('release-prs-')
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, stdio: 'pipe' })
    const commit = (msg: string) => git('commit', '-q', '--allow-empty', '-m', msg)
    git('init', '-q', '-b', 'main')
    commit('Merge pull request #1 from someone/old-work')
    // the release tag sits on a release-branch commit, off main, as the Release workflow does it
    git('checkout', '-q', '-b', 'release')
    commit('Release v1.0.0')
    git('tag', 'v1.0.0')
    git('checkout', '-q', 'main')
    commit('Merge pull request #2 from someone/fix-totals')
    commit('feat: yearly view (#3)')
    commit('A direct commit, not a PR')

    const bin = temp('fake-gh-')
    const titles: Record<string, string> = { '2': 'fix: card totals', '3': 'feat: yearly view' }
    writeFileSync(
      path.join(bin, 'gh'),
      `#!/usr/bin/env bash\ncase "$3" in\n${Object.entries(titles)
        .map(([n, t]) => `  ${n}) echo '${t}' ;;\n`)
        .join('')}  *) exit 1 ;;\nesac\n`,
    )
    chmodSync(path.join(bin, 'gh'), 0o755)
    return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } }
  }

  it('lists the PRs merged into main since the newest release, with their titles', () => {
    const { dir, env } = setup()
    const out = execFileSync('bash', [path.join(SCRIPTS, 'release-prs.sh')], { cwd: dir, env }).toString()
    expect(out.trim().split('\n')).toEqual(['2\tfix: card totals', '3\tfeat: yearly view'])
  })
})
