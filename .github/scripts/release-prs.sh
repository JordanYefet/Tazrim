#!/usr/bin/env bash
# The PRs merged into main since the newest release (latest-release.sh), one "<number><TAB><title>" per
# line, oldest first. Found from main's own commits after that tag: GitHub's merge commits
# ("Merge pull request #12 from …") and squash merges ("Some title (#12)"); the titles come from
# `gh pr view`, which needs GH_TOKEN in Actions. With no release yet, every PR on main counts.
set -euo pipefail

latest=$(bash "$(dirname "$0")/latest-release.sh")
range=HEAD
if [ -n "$latest" ]; then range="v$latest..HEAD"; fi

git log --first-parent --reverse --format=%s "$range" |
  sed -nE 's/^Merge pull request #([0-9]+) from .*/\1/p; s/.*\(#([0-9]+)\)$/\1/p' |
  while read -r n; do
    printf '%s\t%s\n' "$n" "$(gh pr view "$n" --json title --jq .title)"
  done
